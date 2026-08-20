import { NormalizedConversation, ParseWarning } from "src/Models/Knowledge/ChatGPTExport";

/**
 * The ingestion boundary.
 *
 * Everything downstream - change detection, semantic extraction, routing,
 * writing - depends only on `NormalizedConversation`. Adding a new way to get
 * conversations (browser companion, another export format, an API) means
 * adding one adapter here and nothing else.
 */

export interface ConversationBatch {
  /** File path or logical id this batch came from. */
  ref: string;
  conversations: NormalizedConversation[];
  warnings: ParseWarning[];
  totalEntries: number;
  /** Cheap change signal for the ingestion registry. */
  size?: number;
  mtime?: number;
}

export interface ConversationIngestionAdapter {
  /** Stable identifier, e.g. "official-export", "watch-folder", "live-capture". */
  readonly kind: string;
  /** Human-readable description shown in status and logs. */
  describe(): string;
  /** Load everything this adapter currently offers. */
  load(): Promise<ConversationBatch[]>;
}
