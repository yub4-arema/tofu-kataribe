import { describe, expect, it } from "vitest";
import { ReactionTagParser } from "../src/core/reaction-parser.js";
import { SentenceSplitter } from "../src/core/sentence-splitter.js";
import { InMemoryConversationStore, SessionQueue } from "../src/core/store.js";

describe("ReactionTagParser", () => {
  it("removes split reaction tags", () => {
    const parser = new ReactionTagParser();
    expect(parser.parse("[react").text).toBe("");
    expect(parser.parse("ion:happy]こん")).toEqual({ text: "こん", reaction: "happy" });
  });
  it("falls back to neutral for unknown tags", () => {
    expect(new ReactionTagParser().parse("[reaction:zzz]Hi")).toEqual({
      text: "Hi",
      reaction: "neutral",
    });
  });
});

describe("SentenceSplitter", () => {
  it("splits Japanese punctuation, newlines, and flushes tails", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("あ。い!う\nえ")).toEqual(["あ。", "い!", "う"]);
    expect(splitter.flush()).toEqual(["え"]);
  });
});

describe("InMemoryConversationStore", () => {
  it("keeps the message limit and deletes sessions", async () => {
    const store = new InMemoryConversationStore(2);
    await store.appendTurn("s", "u1", "a1");
    await store.appendTurn("s", "u2", "a2");
    expect(await store.get("s")).toHaveLength(2);
    await store.delete("s");
    expect(await store.get("s")).toEqual([]);
  });
});

describe("SessionQueue", () => {
  it("serializes matching sessions", async () => {
    const queue = new SessionQueue();
    const order: number[] = [];
    await Promise.all([
      queue.enqueue("a", async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      }),
      queue.enqueue("a", async () => {
        order.push(2);
      }),
    ]);
    expect(order).toEqual([1, 2]);
  });
});
