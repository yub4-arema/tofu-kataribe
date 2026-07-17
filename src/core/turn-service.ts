import { ReactionTagParser } from "./reaction-parser.js";
import { SentenceSplitter } from "./sentence-splitter.js";
import type {
  AudioStorage,
  ChatMessage,
  ConversationStore,
  EventConsumer,
  InputTransformer,
  LlmProvider,
  SpeechProvider,
} from "./ports.js";
import type { Reaction, TurnEvent } from "../protocol/events.js";
export class TurnService {
  constructor(
    private readonly deps: {
      llm: LlmProvider;
      speech: SpeechProvider;
      store: ConversationStore;
      audio: AudioStorage;
      systemPrompt: string;
      transformers?: InputTransformer[];
      consumers?: EventConsumer[];
    },
  ) {}
  async *run(sessionId: string, input: string, signal?: AbortSignal): AsyncIterable<TurnEvent> {
    const turnId = crypto.randomUUID();
    const started: TurnEvent = { type: "turn.started", turnId, sessionId };
    yield started;
    await this.consume(started);
    try {
      let transformed = input;
      for (const transformer of this.deps.transformers ?? [])
        transformed = await transformer.transform(transformed);
      const history = await this.deps.store.get(sessionId);
      const messages: ChatMessage[] = [
        { role: "system", content: this.deps.systemPrompt },
        {
          role: "system",
          content: "Prefix each sentence with one reaction tag like [reaction:happy].",
        },
        ...history,
        { role: "user", content: transformed },
      ];
      const parser = new ReactionTagParser();
      const splitter = new SentenceSplitter();
      let reaction: Reaction = "neutral";
      let fullText = "";
      let sentenceIndex = 0;
      const emitSentence = async function* (
        self: TurnService,
        text: string,
      ): AsyncIterable<TurnEvent> {
        sentenceIndex += 1;
        const ready: TurnEvent = { type: "sentence.ready", turnId, sentenceIndex, text, reaction };
        yield ready;
        await self.consume(ready);
        const speech = await self.deps.speech.synthesize(text, reaction, signal);
        if (speech) {
          const saved = await self.deps.audio.save(speech.bytes, speech.contentType);
          const audio: TurnEvent = {
            type: "audio.ready",
            turnId,
            sentenceIndex,
            text,
            reaction,
            audio: {
              id: saved.id,
              url: saved.url,
              contentType: speech.contentType,
              expiresAt: saved.expiresAt.toISOString(),
            },
          };
          yield audio;
          await self.consume(audio);
        }
      };
      for await (const chunk of this.deps.llm.stream(messages, signal)) {
        const parsed = parser.parse(chunk);
        if (parsed.reaction) reaction = parsed.reaction;
        if (parsed.text) {
          fullText += parsed.text;
          const delta: TurnEvent = { type: "text.delta", turnId, delta: parsed.text };
          yield delta;
          await this.consume(delta);
          for (const sentence of splitter.push(parsed.text)) yield* emitSentence(this, sentence);
        }
      }
      const tail = parser.flush();
      if (tail.text) {
        fullText += tail.text;
        const delta: TurnEvent = { type: "text.delta", turnId, delta: tail.text };
        yield delta;
        await this.consume(delta);
      }
      for (const sentence of splitter.flush()) yield* emitSentence(this, sentence);
      await this.deps.store.appendTurn(sessionId, input, fullText);
      const completed: TurnEvent = {
        type: "turn.completed",
        turnId,
        text: fullText,
        sentenceCount: sentenceIndex,
      };
      yield completed;
      await this.consume(completed);
    } catch (cause) {
      yield {
        type: "turn.error",
        turnId,
        error: {
          code: cause instanceof Error ? cause.message : "TURN_FAILED",
          message: "Turn processing failed",
          retryable: true,
        },
      };
    }
  }
  private async consume(event: TurnEvent) {
    for (const consumer of this.deps.consumers ?? [])
      consumer
        .consume(event)
        .catch((error: unknown) => console.error("event_consumer_failed", error));
  }
}
