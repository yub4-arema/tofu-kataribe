import type { AudioInput, ChatMessage, LlmProvider } from "../../core/ports.js";

export type OpenAiCompatibleAuth =
  | { type: "bearer"; apiKey: string }
  | { type: "basic"; username: string; password: string };

export function createOpenAiCompatibleAuth(
  apiKey: string | undefined,
  basicUsername: string | undefined,
  basicPassword: string | undefined,
): OpenAiCompatibleAuth | undefined {
  const hasBasicUsername = Boolean(basicUsername);
  const hasBasicPassword = Boolean(basicPassword);

  if (hasBasicUsername !== hasBasicPassword) throw new Error("OPENAI_BASIC_AUTH_INCOMPLETE");
  if (apiKey && hasBasicUsername) throw new Error("OPENAI_AUTH_AMBIGUOUS");
  if (basicUsername && basicPassword)
    return { type: "basic", username: basicUsername, password: basicPassword };
  if (apiKey) return { type: "bearer", apiKey };
  return undefined;
}

export class OpenAiCompatibleLlmProvider implements LlmProvider {
  constructor(
    private readonly endpoint: string,
    private readonly model: string,
    private readonly auth: OpenAiCompatibleAuth | undefined,
  ) {}
  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.auth ? { authorization: this.authorizationHeader(this.auth) } : {}),
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal: signal ?? null,
    });
    if (!response.ok || !response.body) throw new Error(`LLM_${response.status}`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const content = json.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    }
  }

  async transcribe(audio: AudioInput, signal?: AbortSignal): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.auth ? { authorization: this.authorizationHeader(this.auth) } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe the spoken content accurately. Return only the transcript in the original language.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: Buffer.from(audio.bytes).toString("base64"),
                  format: audio.format,
                },
              },
            ],
          },
        ],
        stream: false,
      }),
      signal: signal ?? null,
    });
    if (!response.ok) throw new Error(`LLM_AUDIO_${response.status}`);
    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const transcript = json.choices?.[0]?.message?.content?.trim();
    if (!transcript) throw new Error("AUDIO_TRANSCRIPTION_EMPTY");
    return transcript;
  }

  async health(): Promise<boolean> {
    return true;
  }

  private authorizationHeader(auth: OpenAiCompatibleAuth): string {
    if (auth.type === "bearer") return `Bearer ${auth.apiKey}`;
    const credentials = Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString("base64");
    return `Basic ${credentials}`;
  }
}
