# tofu-kataribe

Headless AItuber server built with Node.js 24, TypeScript, and Hono. It exposes NDJSON APIs only; web, Discord, and YouTube clients are intentionally external.

## Setup

```sh
proto install
pnpm install
pnpm dev
```

## API

- `POST /v1/turns/stream` streams NDJSON turn events for `{ "sessionId": "discord:guild:channel", "input": "こんにちは" }`.
- `GET /v1/audio/:id` returns temporary WAV audio.
- `GET /v1/health` returns LLM, selected speech provider, and uptime without secrets.
- `DELETE /v1/sessions/:sessionId` clears volatile in-memory history.

## Speech providers

```sh
SPEECH_PROVIDER=none pnpm dev
SPEECH_PROVIDER=voicevox-local VOICEVOX_URL=http://127.0.0.1:50021 VOICEVOX_SPEAKER=1 pnpm dev
SPEECH_PROVIDER=voicevox-ttsquest TTSQUEST_SPEAKER=3 TTSQUEST_KEY=optional pnpm dev
```

TTS Quest V3 is an unofficial VOICEVOX service. Check all character and voice library terms before use. Local VOICEVOX installation, launch, and monitoring are managed separately by the operator.

## NDJSON examples

```sh
curl -N -X POST http://localhost:3000/v1/turns/stream \
  -H 'content-type: application/json' \
  -d '{"sessionId":"local:demo","input":"こんにちは"}'
```

```js
const response = await fetch("/v1/turns/stream", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sessionId: "web:demo", input: "こんにちは" }),
});
for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
  for (const line of chunk.split("\n").filter(Boolean)) console.log(JSON.parse(line));
}
```

## Operations

On a Mac mini, keep only this Node process under `launchd`; manage VOICEVOX separately. The initial deployment assumes one replica. For multiple replicas, replace `ConversationStore` and `AudioStorage` with shared implementations such as Redis and object storage.

## Checks

```sh
pnpm check
```
