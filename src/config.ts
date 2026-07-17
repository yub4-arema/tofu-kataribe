export const env = {
  port: Number(process.env.PORT ?? 3001),
  systemPrompt: process.env.SYSTEM_PROMPT ?? "You are a concise Japanese AItuber.",
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  authToken: process.env.API_AUTH_TOKEN || undefined,
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 30),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000,
  maxConcurrentTurns: Number(process.env.MAX_CONCURRENT_TURNS ?? 4),
  speechProvider: process.env.SPEECH_PROVIDER ?? "none",
};
