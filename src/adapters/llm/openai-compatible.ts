import type { ChatMessage, LlmProvider } from "../../core/ports.js";
export class OpenAiCompatibleLlmProvider implements LlmProvider {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
  ) {}
  async *stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
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
  async health(): Promise<boolean> {
    return true;
  }
}
