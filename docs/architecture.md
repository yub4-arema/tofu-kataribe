# アーキテクチャとファイル構成

## システム概要

`tofu-kataribe` は、外部クライアントから受け取った発話を LLM に送り、生成途中のテキスト、文単位のリアクション、必要に応じて音声情報を NDJSON で返すヘッドレス API サーバーです。

処理の大まかな流れは次のとおりです。

```text
外部クライアント
  -> Hono HTTP API
  -> 認証・入力検証・流量制御
  -> セッション単位の処理キュー
  -> OpenAI 互換 LLM のストリーム
  -> リアクションタグ解析・文分割
  -> 音声合成（任意）・音声保存
  -> NDJSON イベントを順次返却
```

## ファイル構成

```text
tofu-kataribe/
├─ docs/
│  ├─ README.md                         # ドキュメントの入口
│  ├─ setup.md                          # ローカルセットアップ
│  ├─ integration.md                    # 外部サービスからの利用方法
│  ├─ architecture.md                   # 本ファイル
│  └─ deployment-vercel.md              # Vercel デプロイ設計・手順
├─ src/
│  ├─ index.ts                          # 依存関係の組み立てとローカル HTTP サーバー起動
│  ├─ provider-entry.ts                 # 音声プロバイダー指定コマンドの入口
│  ├─ config.ts                         # アプリ共通の環境変数読み込み
│  ├─ adapters/
│  │  ├─ http/app.ts                    # Hono のルート、認証、CORS、流量制御
│  │  ├─ llm/openai-compatible.ts       # OpenAI 互換 LLM のストリーミング接続
│  │  ├─ speech/providers.ts             # 音声合成プロバイダー
│  │  └─ storage/file-audio-storage.ts   # ローカルファイルへの一時音声保存
│  ├─ core/
│  │  ├─ ports.ts                       # 外部機能との境界となるインターフェース
│  │  ├─ store.ts                       # インメモリ会話履歴とセッションキュー
│  │  ├─ turn-service.ts                # 1ターン全体のユースケース
│  │  ├─ reaction-parser.ts             # LLM 出力中のリアクションタグ解析
│  │  └─ sentence-splitter.ts            # 生成テキストの文単位分割
│  └─ protocol/events.ts                 # NDJSON イベント型とリアクション一覧
├─ test/
│  ├─ core.test.ts                      # コア処理のテスト
│  └─ openai-compatible.test.ts         # LLM 認証・ストリーム処理のテスト
├─ .env.example                         # ローカル環境変数のひな型
├─ .prototools                          # proto 用 Node.js / pnpm バージョン
├─ package.json                         # 依存関係と開発コマンド
├─ pnpm-lock.yaml                       # pnpm の依存バージョン固定
├─ tsconfig.json                        # TypeScript 共通設定
└─ tsconfig.build.json                  # dist 出力用のビルド設定
```

`dist/`、`node_modules/`、`.data/`、`.env` は生成物またはローカルデータのため Git 管理しません。

## 主要コンポーネント

### HTTP 層

`src/adapters/http/app.ts` が Hono アプリを作成します。ここで次を担当します。

- CORS
- Bearer トークンによる API 認証
- Zod によるリクエスト検証
- IP 単位の簡易レート制限
- 同時ターン数の制限
- 同一セッションの直列化
- NDJSON ストリーミング

認証対象は `POST /v1/turns/stream` と `DELETE /v1/sessions/:sessionId` です。ヘルスチェックと音声取得は現在認証されません。

### ターン処理

`src/core/turn-service.ts` が 1 回の発話処理を進行します。

1. `turn.started` を返す
2. システムプロンプト、会話履歴、ユーザー入力を LLM に渡す
3. LLM の差分を `text.delta` として返す
4. リアクションタグを解析し、句読点または改行で文を分割する
5. 文ごとに `sentence.ready` を返す
6. 音声合成が有効なら音声を保存して `audio.ready` を返す
7. 会話履歴を更新して `turn.completed` を返す
8. 失敗時は `turn.error` を返す

### 外部サービスとの境界

`src/core/ports.ts` のインターフェースを介して、LLM、音声合成、会話履歴、音声保存を交換できる設計です。

現在の実装は次の組み合わせです。

| 用途                   | 実装                                 | 現在の保存範囲           |
| ---------------------- | ------------------------------------ | ------------------------ |
| LLM                    | OpenAI 互換 Chat Completions         | 外部サービス             |
| 会話履歴               | `InMemoryConversationStore`          | Node.js プロセス内のみ   |
| 音声合成               | none / ローカル VOICEVOX / TTS Quest | 外部サービスまたは無効   |
| 音声ファイル           | `FileAudioStorage`                   | ローカルの `.data/audio` |
| レート制限             | HTTP アダプター内の `Map`            | Node.js プロセス内のみ   |
| 同一セッションのキュー | `SessionQueue`                       | Node.js プロセス内のみ   |

## API

| メソッド | パス                      | 認証            | 用途                                     |
| -------- | ------------------------- | --------------- | ---------------------------------------- |
| `GET`    | `/v1/health`              | なし            | LLM、音声プロバイダー、稼働時間を返す    |
| `POST`   | `/v1/turns/stream`        | 設定時は Bearer | 発話を処理し NDJSON をストリーミングする |
| `GET`    | `/v1/audio/:id`           | なし            | 一時保存された WAV 音声を取得する        |
| `DELETE` | `/v1/sessions/:sessionId` | 設定時は Bearer | 指定セッションの会話履歴を削除する       |

`POST /v1/turns/stream` のリクエスト例です。

```json
{
  "sessionId": "discord:guild:channel",
  "input": "こんにちは"
}
```

`sessionId` は英数字、`:`, `_`, `-` のみで 1〜128 文字、`input` は空白除去後 1〜4000 文字です。

## NDJSON イベント

1 行ごとに独立した JSON が返ります。主な順序は次のとおりですが、音声を無効にした場合は `audio.ready` を返しません。

```text
turn.started
  -> text.delta（複数回）
  -> sentence.ready（文ごと）
  -> audio.ready（音声合成時、文ごと）
  -> turn.completed
```

処理途中で失敗した場合は `turn.error` を返します。HTTP ストリーム開始後のエラーは、HTTP ステータスではなくこのイベントで通知されます。

## 状態管理上の注意

現在の会話履歴、レート制限、同時実行数、セッションキューはプロセス内メモリにあります。プロセスを再起動すると会話履歴は消えます。これは現段階の仕様です。
