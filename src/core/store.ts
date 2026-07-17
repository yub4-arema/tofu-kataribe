import type { ChatMessage, ConversationStore } from "./ports.js";
export class InMemoryConversationStore implements ConversationStore {
  #sessions = new Map<string, { messages: ChatMessage[]; touched: number }>();
  constructor(
    private readonly maxMessages = 16,
    private readonly ttlMs = 86_400_000,
  ) {}
  async get(sessionId: string): Promise<ChatMessage[]> {
    const session = this.#sessions.get(sessionId);
    if (!session || Date.now() - session.touched > this.ttlMs) return [];
    session.touched = Date.now();
    return [...session.messages];
  }
  async appendTurn(sessionId: string, user: string, assistant: string): Promise<void> {
    const current = await this.get(sessionId);
    const messages = [
      ...current,
      { role: "user" as const, content: user },
      { role: "assistant" as const, content: assistant },
    ].slice(-this.maxMessages);
    this.#sessions.set(sessionId, { messages, touched: Date.now() });
  }
  async delete(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
  }
  async sweep(): Promise<void> {
    const now = Date.now();
    for (const [key, value] of this.#sessions)
      if (now - value.touched > this.ttlMs) this.#sessions.delete(key);
  }
}
export class SessionQueue {
  #tails = new Map<string, Promise<void>>();
  enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(sessionId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.#tails.set(
      sessionId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run.finally(() => {
      if (this.#tails.get(sessionId) === run) this.#tails.delete(sessionId);
    });
  }
}
