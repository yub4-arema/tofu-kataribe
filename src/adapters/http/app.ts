import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import { z } from "zod";
import { ndjson } from "../../protocol/events.js";
import type {
  AudioStorage,
  ConversationStore,
  LlmProvider,
  SpeechProvider,
} from "../../core/ports.js";
import { SessionQueue } from "../../core/store.js";
import { TurnService } from "../../core/turn-service.js";
const requestSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/),
  input: z.string().trim().min(1).max(4000),
});
export function createApp(deps: {
  llm: LlmProvider;
  speech: SpeechProvider;
  store: ConversationStore;
  audio: AudioStorage;
  systemPrompt: string;
  authToken: string | undefined;
  corsOrigins?: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxConcurrentTurns: number;
}) {
  const app = new Hono();
  const queue = new SessionQueue();
  const ips = new Map<string, number[]>();
  let active = 0;
  const started = Date.now();
  app.use(
    "*",
    cors({
      origin: (origin) => (!origin || (deps.corsOrigins ?? []).includes(origin) ? origin : null),
    }),
  );
  const authorize = (c: Context) =>
    !deps.authToken || c.req.header("authorization") === `Bearer ${deps.authToken}`;
  app.get("/v1/health", async (c) => {
    const ok = (await deps.llm.health()) && (await deps.speech.health());
    return c.json(
      {
        llm: ok,
        speechProvider: deps.speech.name,
        uptimeSeconds: Math.floor((Date.now() - started) / 1000),
      },
      ok ? 200 : 503,
    );
  });
  app.get("/v1/audio/:id", async (c) => {
    const item = await deps.audio.get(c.req.param("id"));
    if (!item)
      return c.json({ error: { code: "AUDIO_NOT_FOUND", message: "Audio not found" } }, 404);
    return new Response(Buffer.from(item.bytes), { headers: { "content-type": item.contentType } });
  });
  app.delete("/v1/sessions/:sessionId", async (c) => {
    if (!authorize(c))
      return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    await deps.store.delete(c.req.param("sessionId"));
    return c.body(null, 204);
  });
  app.post("/v1/turns/stream", async (c) => {
    if (!authorize(c))
      return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success)
      return c.json({ error: { code: "INVALID_REQUEST", message: "Invalid request" } }, 400);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (deps.rateLimitMax > 0) {
      const now = Date.now();
      const hits = (ips.get(ip) ?? []).filter((t) => now - t < deps.rateLimitWindowMs);
      if (hits.length >= deps.rateLimitMax)
        return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429, {
          "Retry-After": String(Math.ceil(deps.rateLimitWindowMs / 1000)),
        });
      hits.push(now);
      ips.set(ip, hits);
    }
    if (deps.maxConcurrentTurns > 0 && active >= deps.maxConcurrentTurns)
      return c.json({ error: { code: "TOO_MANY_TURNS", message: "Too many turns" } }, 429, {
        "Retry-After": "1",
      });
    active += 1;
    const service = new TurnService(deps);
    return stream(c, async (s) => {
      try {
        await queue.enqueue(parsed.data.sessionId, async () => {
          for await (const event of service.run(
            parsed.data.sessionId,
            parsed.data.input,
            c.req.raw.signal,
          ))
            await s.write(ndjson(event));
        });
      } finally {
        active -= 1;
      }
    });
  });
  return app;
}
