export class SentenceSplitter {
  #buffer = "";
  push(delta: string): string[] {
    this.#buffer += delta;
    const sentences: string[] = [];
    let start = 0;
    for (let i = 0; i < this.#buffer.length; i += 1) {
      if (/[。！？!?\n]/u.test(this.#buffer[i] ?? "")) {
        const sentence = this.#buffer.slice(start, i + 1).trim();
        if (sentence) sentences.push(sentence);
        start = i + 1;
      }
    }
    this.#buffer = this.#buffer.slice(start);
    return sentences;
  }
  flush(): string[] {
    const sentence = this.#buffer.trim();
    this.#buffer = "";
    return sentence ? [sentence] : [];
  }
}
