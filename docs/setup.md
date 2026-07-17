# ローカルセットアップ

このドキュメントでは、kataribe を手元で起動し、外部サービスから接続できる状態まで準備します。

## 1. 必要なもの

- Node.js 24
- pnpm 10
- OpenAI 互換の Streaming Chat Completions API
- 音声を利用する場合のみ、VOICEVOX または TTS Quest 互換 API

このリポジトリでは `.prototools` と `package.json` で Node.js 24 / pnpm 10 を指定しています。proto を利用できる場合は次で揃えられます。

```sh
proto install
node --version
pnpm --version
```

想定されるメジャーバージョンは Node.js `24`、pnpm `10` です。

## 2. 依存関係をインストールする

リポジトリ直下で実行します。

```sh
pnpm install
```

## 3. `.env` を作る

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```sh
cp .env.example .env
```

`.env` には秘密情報が入るため Git 管理されません。実値を `.env.example` やソースコードへ書かないでください。

## 4. LLM を設定する

kataribe は OpenAI 互換の Streaming Chat Completions API を呼びます。`OPENAI_BASE_URL` には API のルートではなく、`/v1/chat/completions` まで含む完全な URL を設定します。

### 認証なしのローカル Ollama

```dotenv
OPENAI_BASE_URL=http://localhost:11434/v1/chat/completions
OPENAI_MODEL=gpt-oss:20b
OPENAI_API_KEY=
OPENAI_BASIC_USERNAME=
OPENAI_BASIC_PASSWORD=
```

Ollama 側で対象モデルを取得し、HTTP API が起動している必要があります。

### Bearer 認証を使う OpenAI 互換 API

```dotenv
OPENAI_BASE_URL=https://provider.example/v1/chat/completions
OPENAI_MODEL=provider-model-name
OPENAI_API_KEY=your-secret-key
OPENAI_BASIC_USERNAME=
OPENAI_BASIC_PASSWORD=
```

### Basic 認証付き Ollama ゲートウェイ

```dotenv
OPENAI_BASE_URL=https://ollama.example/v1/chat/completions
OPENAI_MODEL=llama4:scout
OPENAI_API_KEY=
OPENAI_BASIC_USERNAME=your-username
OPENAI_BASIC_PASSWORD=your-password
```

`OPENAI_API_KEY` と Basic 認証は同時に設定できません。Basic 認証は username と password の両方が必要です。

## 5. kataribe API を設定する

ローカル確認用の例です。

```dotenv
PORT=3001
SYSTEM_PROMPT=You are a concise Japanese AItuber.
API_AUTH_TOKEN=local-development-token
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_MAX_REQUESTS=30
RATE_LIMIT_WINDOW_SECONDS=60
MAX_CONCURRENT_TURNS=4
```

各設定の意味:

| 変数                        | 内容                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `PORT`                      | kataribe が待ち受けるポート。既定は `3001`                      |
| `SYSTEM_PROMPT`             | LLM に毎ターン渡す基本指示                                      |
| `API_AUTH_TOKEN`            | 生成・セッション削除 API の Bearer トークン。空なら認証を無効化 |
| `CORS_ORIGINS`              | ブラウザーから直接呼ぶことを許可する Origin。複数はカンマ区切り |
| `RATE_LIMIT_MAX_REQUESTS`   | IP ごとの時間枠内リクエスト上限。`0` 以下なら無効               |
| `RATE_LIMIT_WINDOW_SECONDS` | レート制限の時間枠                                              |
| `MAX_CONCURRENT_TURNS`      | 1 プロセス内で同時処理するターン数。`0` 以下なら無効            |

ローカルでも他プロセスから接続するなら `API_AUTH_TOKEN` を設定して、認証を含む接続確認をしておくことを推奨します。

## 6. 音声プロバイダーを選ぶ

### 音声なし

最初の接続確認では音声なしが最も単純です。

```sh
pnpm dev:none
```

または `.env` に次を設定して `pnpm dev` を実行します。

```dotenv
SPEECH_PROVIDER=none
```

### ローカル VOICEVOX

先に VOICEVOX を起動してから実行します。

```dotenv
SPEECH_PROVIDER=voicevox-local
VOICEVOX_URL=http://127.0.0.1:50021
VOICEVOX_SPEAKER=1
```

```sh
pnpm dev:local
```

### TTS Quest 互換 API

```dotenv
SPEECH_PROVIDER=voicevox-ttsquest
TTSQUEST_URL=https://api.tts.quest/v3/voicevox/synthesis
TTSQUEST_SPEAKER=3
TTSQUEST_KEY=
SPEECH_TIMEOUT_MS=120000
```

```sh
pnpm dev:api
```

TTS Quest と利用する音声ライブラリの規約は別途確認してください。

## 7. 起動する

`.env` の `SPEECH_PROVIDER` を使う場合:

```sh
pnpm dev
```

音声プロバイダーをコマンドで明示する場合:

```sh
pnpm dev:none
pnpm dev:local
pnpm dev:api
```

起動時に次のような JSON ログが出れば待ち受けを開始しています。

```json
{"event":"server_started","port":3001,"speechProvider":"none"}
```

## 8. 動作確認する

### ヘルスチェック

PowerShell:

```powershell
curl.exe -i http://localhost:3001/v1/health
```

macOS / Linux:

```sh
curl -i http://localhost:3001/v1/health
```

`SPEECH_PROVIDER=none` なら、通常は HTTP 200 と次の形式が返ります。

```json
{"llm":true,"speechProvider":"none","uptimeSeconds":1}
```

現在の LLM ヘルスチェックは接続試験を行わず常に `true` を返すため、実際の LLM 接続は次のターン API でも確認してください。

### 1 ターン送る

PowerShell:

```powershell
curl.exe -N `
  -X POST http://localhost:3001/v1/turns/stream `
  -H "content-type: application/json" `
  -H "authorization: Bearer local-development-token" `
  -d '{"sessionId":"local:setup","input":"短く自己紹介してください。"}'
```

`API_AUTH_TOKEN` を空にした場合は `authorization` ヘッダーを省略できます。成功時は `turn.started`、`text.delta`、`sentence.ready`、`turn.completed` などが 1 行 1 JSON で順次表示されます。

## 9. ビルド版を確認する

```sh
pnpm build
pnpm start:none
```

`.env` の音声設定を利用する場合は `pnpm start`、プロバイダーを明示する場合は `start:none`、`start:local`、`start:api` を使用します。

## 10. 開発前の一括確認

```sh
pnpm check
```

型検査、Lint、フォーマット検査、テスト、ビルドが順番に実行されます。

## よくあるセットアップエラー

| 症状                           | 確認すること                                              |
| ------------------------------ | --------------------------------------------------------- |
| `LLM_401` / `LLM_403`          | LLM 側の API キーまたは Basic 認証                        |
| `LLM_404`                      | `OPENAI_BASE_URL` に `/v1/chat/completions` が含まれるか  |
| `OPENAI_BASIC_AUTH_INCOMPLETE` | Basic の username と password が両方あるか                |
| `OPENAI_AUTH_AMBIGUOUS`        | Bearer と Basic を同時設定していないか                    |
| `/v1/health` が 503            | VOICEVOX が起動し、`VOICEVOX_URL` へ到達できるか          |
| ブラウザーだけ CORS エラー     | `CORS_ORIGINS` のスキーム、ホスト、ポートが完全一致するか |
| 生成 API が 401                | `Authorization: Bearer <API_AUTH_TOKEN>` を送っているか   |
| 生成 API が 429                | レート上限、同時ターン上限、`Retry-After` を確認          |

別サービスからの具体的な接続コードは [integration.md](./integration.md) を参照してください。
