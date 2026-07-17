# tofu-kataribe

Headless AItuber server built with Node.js 24, TypeScript, and Hono. It exposes NDJSON APIs only; web, Discord, and YouTube clients are intentionally external.

## Documentation

- [Documentation index](./docs/README.md)
- [Local setup](./docs/setup.md)
- [Connecting another service to kataribe](./docs/integration.md)
- [Architecture and file layout](./docs/architecture.md)
- [Vercel deployment](./docs/deployment-vercel.md)

## Setup

```sh
proto install
pnpm install
cp .env.example .env
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`. Configure the LLM endpoint and authentication in `.env` before starting. See [docs/setup.md](./docs/setup.md) for provider-specific examples and verification steps.

## API

- `POST /v1/turns/stream` streams NDJSON turn events for `{ "sessionId": "discord:guild:channel", "input": "こんにちは" }`.
- `GET /v1/audio/:id` returns temporary WAV audio.
- `GET /v1/health` returns LLM, selected speech provider, and uptime without secrets.
- `DELETE /v1/sessions/:sessionId` clears volatile in-memory history.

## Connecting another service

Other services use kataribe as an HTTP streaming API. Send a stable `sessionId` and the user's text to `POST /v1/turns/stream`, then process each newline-delimited JSON event as it arrives.

```sh
curl -N -X POST http://localhost:3001/v1/turns/stream \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_API_AUTH_TOKEN' \
  -d '{"sessionId":"discord:guild:channel","input":"こんにちは"}'
```

The authorization header is only required when `API_AUTH_TOKEN` is configured. Keep this token on the server side; do not embed it in browser JavaScript. Robust Node.js streaming code, browser proxy guidance, Bot/Webhook patterns, event handling, audio URL handling, and error behavior are documented in [docs/integration.md](./docs/integration.md).

## Speech providers

```sh
pnpm dev:none
pnpm dev:local
pnpm dev:api
```

TTS Quest V3 is an unofficial VOICEVOX service. Check all character and voice library terms before use. Local VOICEVOX installation, launch, and monitoring are managed separately by the operator.

The matching production commands are `pnpm start:none`, `pnpm start:local`, and `pnpm start:api` after `pnpm build`. Provider URLs, speaker IDs, API keys, and other settings come from `.env`. Plain `pnpm dev` and `pnpm start` use the `SPEECH_PROVIDER` value from `.env`.

## LLM providers

The LLM adapter uses the OpenAI-compatible streaming Chat Completions format. Set a full `/v1/chat/completions` URL and model name to switch providers.

For an Ollama server behind Basic authentication:

```sh
OPENAI_BASE_URL=http://your-ollama-host:5806/v1/chat/completions \
OPENAI_MODEL=llama4:scout \
OPENAI_BASIC_USERNAME=your-username \
OPENAI_BASIC_PASSWORD=your-password \
pnpm dev
```

For a provider using Bearer authentication, set `OPENAI_API_KEY` instead and leave `OPENAI_BASIC_USERNAME` and `OPENAI_BASIC_PASSWORD` empty. Do not commit real credentials; use [.env.example](./.env.example) as the configuration template.

## NDJSON examples

```sh
curl -N -X POST http://localhost:3001/v1/turns/stream \
  -H 'content-type: application/json' \
  -d '{"sessionId":"local:demo","input":"こんにちは"}'
```

Do not parse each network chunk as one JSON value: one JSON line may be split across chunks. Use the buffered parser in [docs/integration.md](./docs/integration.md).

## Operations

On a Mac mini, keep only this Node process under `launchd`; manage VOICEVOX separately. The current deployment assumes one replica, and conversation history is cleared when the process restarts.

## Checks

```sh
pnpm check
```
