import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOpenAiCompatibleAuth,
  OpenAiCompatibleLlmProvider,
} from "../src/adapters/llm/openai-compatible.js";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAiCompatibleLlmProvider", () => {
  it("streams an OpenAI-compatible response through Basic authentication", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"こん"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":"にちは"}}]}\n\n' +
            "data: [DONE]\n\n",
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiCompatibleLlmProvider(
      "http://ollama.example/v1/chat/completions",
      "llama4:scout",
      createOpenAiCompatibleAuth(undefined, "user", "password"),
    );
    const chunks: string[] = [];
    for await (const chunk of provider.stream([{ role: "user", content: "Hello!" }]))
      chunks.push(chunk);

    expect(chunks).toEqual(["こん", "にちは"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://ollama.example/v1/chat/completions");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from("user:password").toString("base64")}`,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "llama4:scout",
      messages: [{ role: "user", content: "Hello!" }],
      stream: true,
    });
  });

  it("keeps Bearer authentication for other OpenAI-compatible providers", () => {
    expect(createOpenAiCompatibleAuth("secret", undefined, undefined)).toEqual({
      type: "bearer",
      apiKey: "secret",
    });
  });

  it("rejects incomplete or ambiguous authentication settings", () => {
    expect(() => createOpenAiCompatibleAuth(undefined, "user", undefined)).toThrow(
      "OPENAI_BASIC_AUTH_INCOMPLETE",
    );
    expect(() => createOpenAiCompatibleAuth("secret", "user", "password")).toThrow(
      "OPENAI_AUTH_AMBIGUOUS",
    );
  });
});
