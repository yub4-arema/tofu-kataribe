export const reactions = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "thinking",
  "surprised",
  "confused",
  "embarrassed",
] as const;
export type Reaction = (typeof reactions)[number];
export type TurnEvent =
  | { type: "turn.started"; turnId: string; sessionId: string }
  | { type: "input.transcribed"; turnId: string; text: string }
  | { type: "text.delta"; turnId: string; delta: string }
  | {
      type: "sentence.ready";
      turnId: string;
      sentenceIndex: number;
      text: string;
      reaction: Reaction;
    }
  | {
      type: "audio.ready";
      turnId: string;
      sentenceIndex: number;
      text: string;
      reaction: Reaction;
      audio: { id: string; url: string; contentType: "audio/wav"; expiresAt: string };
    }
  | { type: "turn.completed"; turnId: string; text: string; sentenceCount: number }
  | {
      type: "turn.error";
      turnId: string;
      error: { code: string; message: string; retryable: boolean };
    };
export const ndjson = (event: TurnEvent): string => `${JSON.stringify(event)}\n`;
export function isReaction(value: string): value is Reaction {
  return (reactions as readonly string[]).includes(value);
}
