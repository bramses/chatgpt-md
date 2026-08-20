import {
  LiveConversationPayload,
  NormalizedConversation,
  NormalizedMessage,
  NormalizedRole,
} from "src/Models/Knowledge/ChatGPTExport";
import { shortHash } from "src/Utilities/KnowledgeHashing";
import { ConversationBatch, ConversationIngestionAdapter } from "./ConversationSource";

/**
 * Generic push ingestion.
 *
 * A future companion (browser extension, local helper, another export format)
 * only has to hand over `{ conversationId, title, createdAt, updatedAt,
 * messages }`. Nothing here depends on undocumented ChatGPT endpoints, and
 * nothing scrapes: the caller supplies the data.
 */
export class LiveCaptureAdapter implements ConversationIngestionAdapter {
  readonly kind = "live-capture";

  constructor(
    private readonly payloads: LiveConversationPayload[],
    private readonly ref = "live-capture"
  ) {}

  describe(): string {
    return `Live capture (${this.payloads.length} conversation${this.payloads.length === 1 ? "" : "s"})`;
  }

  async load(): Promise<ConversationBatch[]> {
    const conversations: NormalizedConversation[] = [];
    const warnings: { conversationId?: string; reason: string }[] = [];

    this.payloads.forEach((payload, index) => {
      const conversation = normalizeLivePayload(payload, this.kind, this.ref);
      if (conversation) conversations.push(conversation);
      else warnings.push({ reason: `Live payload ${index} contained no readable messages` });
    });

    return [{ ref: this.ref, conversations, warnings, totalEntries: this.payloads.length }];
  }
}

function toSeconds(value: string | number | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e11 ? value / 1000 : value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed / 1000;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1e11 ? numeric / 1000 : numeric;
  }
  return undefined;
}

function normalizeRole(value: unknown): NormalizedRole {
  const role = typeof value === "string" ? value.toLowerCase() : "";
  if (role === "user" || role === "assistant" || role === "system") return role;
  if (role === "tool" || role === "function") return "tool";
  return "assistant";
}

export function normalizeLivePayload(
  payload: LiveConversationPayload,
  sourceKind: string,
  sourceRef: string
): NormalizedConversation | null {
  const rawMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages: NormalizedMessage[] = [];

  rawMessages.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    const content =
      typeof record.content === "string" ? record.content : typeof record.text === "string" ? record.text : "";
    if (!content.trim()) return;
    messages.push({
      id: typeof record.id === "string" && record.id ? record.id : `live-${index}`,
      role: normalizeRole(record.role),
      content: content.trim(),
      createdAt: toSeconds(record.createdAt as string | number | undefined),
    });
  });

  if (messages.length === 0) return null;

  const title = (payload.title || "").trim() || "Untitled conversation";
  const createdAt = toSeconds(payload.createdAt) ?? messages[0]?.createdAt;
  const conversationId =
    payload.conversationId || payload.id || `live-${shortHash(`${title}|${createdAt ?? 0}|${messages.length}`)}`;

  return {
    conversationId,
    title,
    createdAt,
    updatedAt: toSeconds(payload.updatedAt) ?? messages[messages.length - 1]?.createdAt ?? createdAt,
    messages,
    sourceKind,
    sourceRef,
  };
}
