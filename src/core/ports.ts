import type { Reaction, TurnEvent } from "../protocol/events.js";
export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface AudioInput {
  bytes: Uint8Array;
  format: "wav" | "mp3";
}
export interface LlmProvider {
  stream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
  transcribe(audio: AudioInput, signal?: AbortSignal): Promise<string>;
  health(): Promise<boolean>;
}
export interface SpeechResult {
  bytes: Uint8Array;
  contentType: "audio/wav";
}
export interface SpeechProvider {
  readonly name: string;
  synthesize(
    text: string,
    reaction: Reaction,
    signal?: AbortSignal,
  ): Promise<SpeechResult | undefined>;
  health(): Promise<boolean>;
}
export interface AudioStorage {
  save(
    bytes: Uint8Array,
    contentType: "audio/wav",
  ): Promise<{ id: string; url: string; expiresAt: Date }>;
  get(id: string): Promise<{ bytes: Uint8Array; contentType: "audio/wav" } | undefined>;
  sweep(): Promise<void>;
}
export interface InputTransformer {
  transform(input: string): Promise<string>;
}
export interface EventConsumer {
  consume(event: TurnEvent): Promise<void>;
}
