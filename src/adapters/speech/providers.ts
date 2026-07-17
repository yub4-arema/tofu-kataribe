import type { Reaction } from "../../protocol/events.js";
import type { SpeechProvider } from "../../core/ports.js";
export class NoSpeechProvider implements SpeechProvider {
  readonly name = "none";
  async synthesize() {
    return undefined;
  }
  async health() {
    return true;
  }
}
export class VoicevoxLocalProvider implements SpeechProvider {
  readonly name = "voicevox-local";
  constructor(
    private readonly baseUrl = "http://127.0.0.1:50021",
    private readonly speaker = "1",
  ) {}
  async synthesize(text: string, _reaction: Reaction, signal?: AbortSignal) {
    const q = new URLSearchParams({ text, speaker: this.speaker });
    const queryResponse = await fetch(`${this.baseUrl}/audio_query?${q}`, {
      method: "POST",
      signal: signal ?? null,
    });
    if (!queryResponse.ok) throw new Error("VOICEVOX_AUDIO_QUERY_FAILED");
    const query = (await queryResponse.json()) as Record<string, unknown>;
    query.postPhonemeLength = Math.max(Number(query.postPhonemeLength ?? 0), 0.35);
    const synth = await fetch(
      `${this.baseUrl}/synthesis?speaker=${encodeURIComponent(this.speaker)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(query),
        signal: signal ?? null,
      },
    );
    if (!synth.ok) throw new Error("VOICEVOX_SYNTHESIS_FAILED");
    return { bytes: new Uint8Array(await synth.arrayBuffer()), contentType: "audio/wav" as const };
  }
  async health() {
    try {
      return (await fetch(`${this.baseUrl}/version`)).ok;
    } catch {
      return false;
    }
  }
}
export class TtsQuestVoicevoxProvider implements SpeechProvider {
  readonly name = "voicevox-ttsquest";
  constructor(
    private readonly baseUrl = "https://api.tts.quest/v3/voicevox/synthesis",
    private readonly speaker = "3",
    private readonly key?: string,
    private readonly timeoutMs = 120_000,
  ) {}
  async synthesize(text: string, _reaction: Reaction, signal?: AbortSignal) {
    const form = new URLSearchParams({ text, speaker: this.speaker });
    if (this.key) form.set("key", this.key);
    const first = await fetch(this.baseUrl, { method: "POST", body: form, signal: signal ?? null });
    if (!first.ok) throw new Error("TTSQUEST_REQUEST_FAILED");
    let status = (await first.json()) as {
      wavDownloadUrl?: string;
      audioStatusUrl?: string;
      retryAfter?: number;
      isAudioReady?: boolean;
    };
    const deadline = Date.now() + this.timeoutMs;
    while (!status.wavDownloadUrl && status.audioStatusUrl && Date.now() < deadline) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1000, (status.retryAfter ?? 1) * 1000)),
      );
      const next = await fetch(status.audioStatusUrl, { signal: signal ?? null });
      if (next.status === 429) continue;
      if (!next.ok) throw new Error("TTSQUEST_STATUS_FAILED");
      status = (await next.json()) as typeof status;
    }
    if (!status.wavDownloadUrl) throw new Error("TTSQUEST_TIMEOUT");
    const wav = await fetch(status.wavDownloadUrl, { signal: signal ?? null });
    if (!wav.ok) throw new Error("TTSQUEST_DOWNLOAD_FAILED");
    return { bytes: new Uint8Array(await wav.arrayBuffer()), contentType: "audio/wav" as const };
  }
  async health() {
    return true;
  }
}
