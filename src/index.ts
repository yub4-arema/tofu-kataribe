import { serve } from "@hono/node-server";
import { createApp } from "./adapters/http/app.js";
import { OpenAiCompatibleLlmProvider } from "./adapters/llm/openai-compatible.js";
import {
  NoSpeechProvider,
  TtsQuestVoicevoxProvider,
  VoicevoxLocalProvider,
} from "./adapters/speech/providers.js";
import { FileAudioStorage } from "./adapters/storage/file-audio-storage.js";
import { env } from "./config.js";
import { InMemoryConversationStore } from "./core/store.js";
const llm = new OpenAiCompatibleLlmProvider(
  process.env.OPENAI_BASE_URL ?? "http://localhost:11434/v1/chat/completions",
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_MODEL ?? "gpt-4o-mini",
);
const speech =
  env.speechProvider === "voicevox-local"
    ? new VoicevoxLocalProvider(process.env.VOICEVOX_URL, process.env.VOICEVOX_SPEAKER)
    : env.speechProvider === "voicevox-ttsquest"
      ? new TtsQuestVoicevoxProvider(
          undefined,
          process.env.TTSQUEST_SPEAKER,
          process.env.TTSQUEST_KEY,
          Number(process.env.SPEECH_TIMEOUT_MS ?? 120000),
        )
      : new NoSpeechProvider();
const app = createApp({
  llm,
  speech,
  store: new InMemoryConversationStore(),
  audio: new FileAudioStorage(),
  systemPrompt: env.systemPrompt,
  authToken: env.authToken,
  corsOrigins: env.corsOrigins,
  rateLimitMax: env.rateLimitMax,
  rateLimitWindowMs: env.rateLimitWindowMs,
  maxConcurrentTurns: env.maxConcurrentTurns,
});
const server = serve({ fetch: app.fetch, port: env.port }, () =>
  console.log(JSON.stringify({ event: "server_started", port: env.port })),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
