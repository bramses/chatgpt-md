import { NormalizedConversation, NormalizedMessage } from "src/Models/Knowledge/ChatGPTExport";

/**
 * Deterministic pre-checks that run before any paid model call.
 *
 * Nothing here decides meaning - it only decides whether a conversation is
 * worth spending a request on, and gives the extractor a cheap hint when a
 * dream is likely. A conversation skipped here is still archived in full.
 */

const DREAM_PATTERNS = [
  /\bi dream(?:ed|t)\b/i,
  /\bin (?:my|the) dream\b/i,
  /\bhad a dream\b/i,
  /\bthis dream\b/i,
  /\bnightmare\b/i,
  /\bdream about\b/i,
  /\bdroom\b/i,
  /\bgedroomd\b/i,
  /\btraum\b/i,
  /\bgetr[a-z]umt\b/i,
  /\bsonh(?:o|ei)\b/i,
];

/** Characters of user-authored content, the only content worth extracting from. */
export function userContentLength(messages: NormalizedMessage[]): number {
  return messages
    .filter((message) => message.role === "user")
    .reduce((total, message) => total + message.content.trim().length, 0);
}

export interface LowValueVerdict {
  skip: boolean;
  reason: string;
}

export function assessConversation(conversation: NormalizedConversation, minUserChars: number): LowValueVerdict {
  if (conversation.messages.length === 0) return { skip: true, reason: "no messages" };

  const userChars = userContentLength(conversation.messages);
  if (userChars === 0) return { skip: true, reason: "no user content" };
  if (userChars < minUserChars) return { skip: true, reason: `below minimum length (${userChars} characters)` };

  return { skip: false, reason: "" };
}

export function detectDreamSignals(text: string): boolean {
  return DREAM_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Split a long conversation on message boundaries.
 * Every message stays intact and stays in exactly one chunk, so nothing is
 * truncated away - long conversations are chunked, never trimmed.
 */
export function chunkMessages(messages: NormalizedMessage[], maxChars: number): NormalizedMessage[][] {
  if (maxChars <= 0) return [messages];

  const chunks: NormalizedMessage[][] = [];
  let current: NormalizedMessage[] = [];
  let currentSize = 0;

  for (const message of messages) {
    const size = message.content.length + 32;
    if (current.length > 0 && currentSize + size > maxChars) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(message);
    currentSize += size;
  }

  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [messages];
}
