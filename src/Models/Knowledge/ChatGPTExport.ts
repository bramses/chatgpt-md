/**
 * Types for the official ChatGPT data export and the provider-independent
 * normalized conversation that the whole knowledge pipeline works on.
 *
 * The raw export shapes are intentionally loose: OpenAI changes the export
 * schema without notice, so the parser treats everything as `unknown` and
 * narrows defensively instead of trusting a typed contract.
 */

export type NormalizedRole = "user" | "assistant" | "system" | "tool";

export interface NormalizedMessage {
  /** Stable message id from the export when present, otherwise a positional id. */
  id: string;
  role: NormalizedRole;
  /** Plain text content. Non-text parts are rendered as placeholders. */
  content: string;
  /** Unix seconds when known. */
  createdAt?: number;
}

/**
 * The single shape every ingestion adapter must produce. Nothing downstream of
 * this type knows whether a conversation came from an export ZIP, the inbox
 * folder, or a future live-capture companion.
 */
export interface NormalizedConversation {
  conversationId: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  messages: NormalizedMessage[];
  /** Which ingestion adapter produced this conversation. */
  sourceKind: string;
  /** Free-form origin marker (file name, "live-capture", ...). Never a secret. */
  sourceRef?: string;
}

export interface ParseWarning {
  conversationId?: string;
  reason: string;
}

export interface ParsedExport {
  conversations: NormalizedConversation[];
  /** Conversations that were present but could not be parsed at all. */
  warnings: ParseWarning[];
  /** Total top-level entries seen in the input, including unparseable ones. */
  totalEntries: number;
}

/** A generic push payload, e.g. from a future browser companion. */
export interface LiveConversationPayload {
  conversationId?: string;
  id?: string;
  title?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  messages?: unknown;
}
