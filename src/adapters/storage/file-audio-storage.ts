import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AudioStorage } from "../../core/ports.js";
export class FileAudioStorage implements AudioStorage {
  #items = new Map<string, { path: string; contentType: "audio/wav"; expiresAt: number }>();
  constructor(
    private readonly dir = ".data/audio",
    private readonly ttlMs = 600_000,
    private readonly baseUrl = "/v1/audio",
  ) {}
  async save(bytes: Uint8Array, contentType: "audio/wav") {
    await mkdir(this.dir, { recursive: true });
    const id = crypto.randomUUID();
    const path = join(this.dir, `${id}.wav`);
    await writeFile(path, bytes);
    const expiresAt = Date.now() + this.ttlMs;
    this.#items.set(id, { path, contentType, expiresAt });
    return { id, url: `${this.baseUrl}/${id}`, expiresAt: new Date(expiresAt) };
  }
  async get(id: string) {
    const item = this.#items.get(id);
    if (!item || Date.now() > item.expiresAt) return undefined;
    return { bytes: await readFile(item.path), contentType: item.contentType };
  }
  async sweep() {
    for (const [id, item] of this.#items)
      if (Date.now() > item.expiresAt) {
        this.#items.delete(id);
        await rm(item.path, { force: true });
      }
  }
}
