# Vercel デプロイ

このドキュメントは 2026-07-17 時点のコードと Vercel 仕様を前提にしています。

## 結論

Vercel 対応は可能です。ただし、現在のコードはローカル常駐サーバー向けなので、Vercel 用のエントリーポイントへ分離する必要があります。

Vercel は Hono アプリを自動検出できますが、認識対象のエントリーポイントから Hono アプリを default export する必要があります。現在の `src/index.ts` は `@hono/node-server` の `serve()` を実行して常駐サーバーを起動するため、Vercel Functions 用の入口とは異なります。

最初の Vercel 対応は `SPEECH_PROVIDER=none` のテキスト配信を対象とします。会話履歴は現在どおりメモリ上に保持し、再起動時に消える仕様とします。

## Vercel 対応チェックリスト

### テキスト配信に必要

- [ ] Hono アプリの組み立てを、ローカルサーバー起動処理から分離する
- [ ] Vercel が認識する `src/index.ts` などから Hono アプリを default export する
- [ ] ローカル用の `serve()` は別エントリーポイントへ移す
- [ ] `SPEECH_PROVIDER=none` で音声保存を使わない構成にする
- [ ] Vercel から到達できる HTTPS の `OPENAI_BASE_URL` を用意する
- [ ] Production と Preview の環境変数を設定する
- [ ] `API_AUTH_TOKEN` を設定し、生成 API を無認証で公開しない
- [ ] `pnpm check` と `vercel dev` を通す

## Vercel 向けに変更する構成

推奨する責務分離は次の形です。これは移行方針であり、現在はまだ実装されていません。

```text
src/
├─ app.ts          # 依存関係を組み立て、Hono app を export
├─ index.ts        # Vercel が読む default export
└─ local-server.ts # ローカルだけで @hono/node-server の serve() を実行
```

Vercel 側の入口ではポートを listen せず、Hono アプリを export します。ローカルの `pnpm dev` は `local-server.ts` を起動する形に変更します。

Vercel の Hono 自動検出を利用する場合、独自の Build Command や Output Directory は原則設定しません。`package.json` と `pnpm-lock.yaml` がリポジトリ直下にあるため、pnpm は自動検出されます。

## Vercel で成立しない現在の状態

| 現在の実装                       | Vercel での対応                                       |
| -------------------------------- | ----------------------------------------------------- |
| `@hono/node-server` で `serve()` | Hono アプリの default export とローカル起動を分離する |
| `FileAudioStorage`               | 初期対応では `SPEECH_PROVIDER=none` にして使用しない  |
| `VOICEVOX_URL=127.0.0.1`         | Vercel から到達できないため初期対応では使用しない     |
| ローカル Ollama URL              | Vercel から到達できる HTTPS URL に変更する            |

## 環境変数

本番値は `.env` や Git にコミットせず、Vercel Project Settings の Environment Variables に登録します。Preview と Production は分けて設定してください。

### LLM

| 変数                    | 必須     | 内容                                          | 例                                        |
| ----------------------- | -------- | --------------------------------------------- | ----------------------------------------- |
| `OPENAI_BASE_URL`       | 必須     | `/v1/chat/completions` まで含む公開 HTTPS URL | `https://example.com/v1/chat/completions` |
| `OPENAI_MODEL`          | 必須     | 接続先で使用するモデル名                      | `gpt-4o-mini`                             |
| `OPENAI_API_KEY`        | 条件付き | Bearer 認証用 API キー                        | Secret 値                                 |
| `OPENAI_BASIC_USERNAME` | 条件付き | Basic 認証のユーザー名                        | Secret 値                                 |
| `OPENAI_BASIC_PASSWORD` | 条件付き | Basic 認証のパスワード                        | Secret 値                                 |

Bearer 認証と Basic 認証は同時に設定できません。Basic 認証は username と password の両方が必要です。両方式の併用または片方だけの Basic 設定は起動時エラーになります。

### アプリケーション

| 変数                        | 推奨値・既定値                        | 内容                                                                    |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `SYSTEM_PROMPT`             | `You are a concise Japanese AItuber.` | LLM に毎ターン渡すシステムプロンプト                                    |
| `API_AUTH_TOKEN`            | Production では必須                   | 生成 API とセッション削除 API の Bearer トークン                        |
| `CORS_ORIGINS`              | 利用する Web クライアントの Origin    | カンマ区切り。例: `https://app.example.com,https://preview.example.com` |
| `RATE_LIMIT_MAX_REQUESTS`   | `30`                                  | 指定時間内に許可する IP ごとのリクエスト数。`0` 以下で無効              |
| `RATE_LIMIT_WINDOW_SECONDS` | `60`                                  | レート制限の計測時間（秒）                                              |
| `MAX_CONCURRENT_TURNS`      | `4`                                   | 1 インスタンス内の同時ターン上限。`0` 以下で無効                        |
| `PORT`                      | ローカルでは `3001`                   | ローカルサーバー用。Vercel Functions では使用しない                     |

`CORS_ORIGINS` はブラウザーからのアクセス制御です。Discord Bot などサーバー間通信には通常 Origin ヘッダーがありません。

### 音声合成

| 変数                | 必須条件            | 内容                                                                    |
| ------------------- | ------------------- | ----------------------------------------------------------------------- |
| `SPEECH_PROVIDER`   | 任意                | `none`、`voicevox-local`、`voicevox-ttsquest` のいずれか。既定は `none` |
| `VOICEVOX_URL`      | `voicevox-local`    | VOICEVOX HTTP API URL。既定は `http://127.0.0.1:50021`                  |
| `VOICEVOX_SPEAKER`  | `voicevox-local`    | 話者 ID。既定は `1`                                                     |
| `TTSQUEST_URL`      | `voicevox-ttsquest` | TTS Quest API URL。既定は `https://api.tts.quest/v3/voicevox/synthesis` |
| `TTSQUEST_SPEAKER`  | `voicevox-ttsquest` | 話者 ID。既定は `3`                                                     |
| `TTSQUEST_KEY`      | 任意                | TTS Quest の API キー                                                   |
| `SPEECH_TIMEOUT_MS` | 任意                | TTS Quest の生成待機上限。既定は `120000`                               |

最初の Vercel 動作確認では `SPEECH_PROVIDER=none` を使用します。`voicevox-local` は、その名前にかかわらず Vercel から到達できる URL がなければ利用できません。TTS Quest を使用する場合はサービスと音声ライブラリの利用規約を別途確認してください。

## Git 連携によるデプロイ手順

GitHub、GitLab、Bitbucket と Vercel を連携する方法を標準手順とします。

1. 上記の「最初のテキスト配信までに必要」を実装する。
2. ローカルで `pnpm check` を実行する。
3. 対象ブランチを Git リモートへ push する。
4. Vercel Dashboard で **Add New > Project** を開く。
5. `tofu-kataribe` のリポジトリを Import する。
6. Root Directory はリポジトリ直下の `.` のままにする。
7. Framework Preset は Hono の自動検出結果を使用する。
8. Node.js Version は `24.x` を選択する。`package.json` の `engines.node` も Node.js 24 を要求している。
9. Build Command と Output Directory は上書きせず、自動設定を使用する。
10. Environment Variables に上記の値を登録する。
11. Deploy を実行する。
12. 発行された Preview URL で後述のスモークテストを実行する。
13. 問題がなければ Production ブランチへマージする。

Git 連携後は、Production ブランチ以外への push と Pull Request で Preview Deployment、Production ブランチへの push で Production Deployment が作成されます。

## CLI による補助手順

Vercel CLI を使う場合は、リポジトリ直下で実行します。

```sh
pnpm dlx vercel login
pnpm dlx vercel link
pnpm dlx vercel env pull .env.local
pnpm dlx vercel dev
```

Preview Deployment を手動で作成する場合:

```sh
pnpm dlx vercel deploy
```

Production へ直接デプロイする場合:

```sh
pnpm dlx vercel deploy --prod
```

通常の開発では Git 連携を使用し、CLI の Production デプロイは障害対応など目的が明確な場合だけにします。

## デプロイ後のスモークテスト

PowerShell では `curl` の別名との衝突を避けるため `curl.exe` を使います。

### ヘルスチェック

```powershell
curl.exe -i https://<deployment-host>/v1/health
```

期待値は HTTP 200 と JSON レスポンスです。ただし現在の LLM `health()` は常に `true` を返すため、この結果だけでは LLM への接続成功を確認できません。

### NDJSON ストリーム

```powershell
curl.exe -N `
  -X POST https://<deployment-host>/v1/turns/stream `
  -H "content-type: application/json" `
  -H "authorization: Bearer <API_AUTH_TOKEN>" `
  -d '{"sessionId":"smoke:test","input":"短く自己紹介してください。"}'
```

確認項目:

- `turn.started` が最初に返る
- `text.delta` が複数回に分かれて返る
- `sentence.ready` が返る
- 最後に `turn.completed` が返る
- 途中で `turn.error` が返っていない
- Vercel Runtime Logs に認証情報やプロンプト本文が不用意に出ていない

`SPEECH_PROVIDER=none` の場合、`audio.ready` が返らないのは正常です。

## ログ確認とロールバック

Dashboard の Deployment 詳細と Runtime Logs で、ビルドエラー、Function の例外、実行時間を確認します。CLI では次を利用できます。

```sh
pnpm dlx vercel inspect <deployment-url>
pnpm dlx vercel logs <deployment-url>
```

直前の Production へ戻す場合:

```sh
pnpm dlx vercel rollback
```

動作確認済みの Preview を Production に昇格する場合:

```sh
pnpm dlx vercel promote <deployment-url>
```

ロールバック後も環境変数は別管理です。コード以外の変更が障害原因でないか確認します。

## よくある問題

| 症状                                  | 確認箇所                                                        |
| ------------------------------------- | --------------------------------------------------------------- |
| Hono のルートが 404                   | Vercel が読むファイルから Hono app を default export しているか |
| ビルド時に Node.js バージョンエラー   | Dashboard と `package.json` が Node.js 24 になっているか        |
| `turn.error` に `LLM_401` / `LLM_403` | LLM 認証方式と Environment Variables                            |
| `turn.error` に `LLM_404`             | `OPENAI_BASE_URL` が `/v1/chat/completions` まで含むか          |
| ローカル Ollama に接続できない        | URL が Vercel から到達できる公開 HTTPS か                       |
| ブラウザーだけ CORS エラー            | `CORS_ORIGINS` がスキームとホストを含む完全な Origin か         |
| ストリームが途中で終了                | LLM / TTS の待機時間と Function の実行時間上限                  |

## 公式資料

- [How to ship a Hono app on Vercel](https://vercel.com/kb/guide/ship-a-hono-app-on-vercel)
- [Using the Node.js Runtime with Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel Functions runtimes and filesystem support](https://vercel.com/docs/functions/runtimes)
- [Deploying Git repositories](https://vercel.com/docs/git)
- [Environment variables](https://vercel.com/docs/environment-variables)
- [Vercel CLI](https://vercel.com/docs/cli)
