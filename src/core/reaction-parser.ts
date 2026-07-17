import { isReaction, type Reaction } from "../protocol/events.js";
export interface ParsedDelta {
  text: string;
  reaction?: Reaction;
}
export class ReactionTagParser {
  #buffer = "";
  parse(chunk: string): ParsedDelta {
    this.#buffer += chunk;
    let text = "";
    let reaction: Reaction | undefined;
    for (;;) {
      const start = this.#buffer.indexOf("[reaction:");
      if (start < 0) {
        const keep = partialReactionPrefixLength(this.#buffer);
        text += this.#buffer.slice(0, this.#buffer.length - keep);
        this.#buffer = this.#buffer.slice(this.#buffer.length - keep);
        break;
      }
      text += this.#buffer.slice(0, start);
      const end = this.#buffer.indexOf("]", start);
      if (end < 0) {
        if (this.#buffer.length - start > 32) {
          this.#buffer = this.#buffer.slice(start + 1);
          reaction = "neutral";
          continue;
        }
        this.#buffer = this.#buffer.slice(start);
        break;
      }
      const value = this.#buffer.slice(start + 10, end);
      reaction = isReaction(value) ? value : "neutral";
      this.#buffer = this.#buffer.slice(end + 1);
    }
    return reaction === undefined ? { text } : { text, reaction };
  }
  flush(): ParsedDelta {
    const text = this.#buffer.replaceAll(/\[reaction:[^\]]*\]?/g, "");
    this.#buffer = "";
    return { text };
  }
}

function partialReactionPrefixLength(value: string): number {
  const tag = "[reaction:";
  const max = Math.min(value.length, tag.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (tag.startsWith(value.slice(-length))) return length;
  }
  return 0;
}
