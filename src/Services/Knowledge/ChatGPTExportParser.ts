import {
  NormalizedConversation,
  NormalizedMessage,
  NormalizedRole,
  ParsedExport,
  ParseWarning,
} from "src/Models/Knowledge/ChatGPTExport";
import { shortHash } from "src/Utilities/KnowledgeHashing";

/**
 * Parser for the official ChatGPT data export.
 *
 * The export schema is not a stable contract, so every field is treated as
 * unknown and narrowed defensively. A conversation is only dropped when no
 * usable message can be recovered at all, and dropping is always reported as a
 * warning rather than silently swallowed.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate / 1000;
  }
  return undefined;
}

function normalizeRole(value: unknown): NormalizedRole {
  const role = (asString(value) || "").toLowerCase();
  if (role === "user" || role === "assistant" || role === "system") return role;
  if (role === "tool" || role === "function") return "tool";
  return "assistant";
}

/** Render one `content` object into plain text, tolerating unknown shapes. */
export function renderMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!isRecord(content)) return "";

  const contentType = asString(content.content_type) || "text";
  const parts = Array.isArray(content.parts) ? content.parts : undefined;

  if (parts) {
    const rendered = parts.map((part) => renderPart(part)).filter((part) => part.length > 0);
    if (rendered.length > 0) return rendered.join("\n\n");
  }

  const text = asString(content.text);
  if (text) return contentType === "code" ? `\`\`\`\n${text}\n\`\`\`` : text;

  const result = asString(content.result);
  if (result) return result;

  if (contentType === "user_editable_context") {
    const profile = asString(content.user_profile);
    const instructions = asString(content.user_instructions);
    return [profile, instructions].filter(Boolean).join("\n\n");
  }

  return parts && parts.length > 0 ? `[unsupported content: ${contentType}]` : "";
}

function renderPart(part: unknown): string {
  if (typeof part === "string") return part.trim();
  if (!isRecord(part)) return "";
  const text = asString(part.text);
  if (text) return text.trim();
  const contentType = asString(part.content_type);
  if (contentType && contentType.includes("image")) return "[image]";
  if (contentType && contentType.includes("audio")) return "[audio]";
  return contentType ? `[${contentType}]` : "";
}

interface MappingNode {
  id: string;
  message?: UnknownRecord;
  parent?: string;
  children: string[];
}

function readMapping(mapping: unknown): Map<string, MappingNode> {
  const nodes = new Map<string, MappingNode>();
  if (!isRecord(mapping)) return nodes;
  for (const [key, raw] of Object.entries(mapping)) {
    if (!isRecord(raw)) continue;
    nodes.set(key, {
      id: asString(raw.id) || key,
      message: isRecord(raw.message) ? raw.message : undefined,
      parent: asString(raw.parent),
      children: Array.isArray(raw.children)
        ? raw.children.filter((child): child is string => typeof child === "string")
        : [],
    });
  }
  return nodes;
}

/**
 * Resolve the conversation branch that ChatGPT itself considers current.
 * Falls back to every message ordered by timestamp so that regenerated or
 * branched conversations never lose content.
 */
function orderedNodes(nodes: Map<string, MappingNode>, currentNode: string | undefined): MappingNode[] {
  if (currentNode && nodes.has(currentNode)) {
    const chain: MappingNode[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined = currentNode;
    while (cursor && nodes.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      const node: MappingNode = nodes.get(cursor)!;
      chain.push(node);
      cursor = node.parent;
    }
    chain.reverse();
    if (chain.some((node) => node.message)) return chain;
  }

  return [...nodes.values()].sort((a, b) => {
    const timeA = asNumber(a.message?.create_time) ?? Number.MAX_SAFE_INTEGER;
    const timeB = asNumber(b.message?.create_time) ?? Number.MAX_SAFE_INTEGER;
    return timeA - timeB;
  });
}

function toNormalizedMessage(raw: UnknownRecord, fallbackId: string): NormalizedMessage | null {
  const author = isRecord(raw.author) ? raw.author : undefined;
  const role = normalizeRole(author?.role);
  const content = renderMessageContent(raw.content).trim();
  if (!content) return null;

  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined;
  if (metadata?.is_visually_hidden_from_conversation === true && role === "system") return null;

  return {
    id: asString(raw.id) || fallbackId,
    role,
    content,
    createdAt: asNumber(raw.create_time),
  };
}

/** Read messages from either the mapping graph or a flat `messages` array. */
function readMessages(entry: UnknownRecord): NormalizedMessage[] {
  const nodes = readMapping(entry.mapping);
  if (nodes.size > 0) {
    return orderedNodes(nodes, asString(entry.current_node))
      .map((node, index) => (node.message ? toNormalizedMessage(node.message, `${node.id}:${index}`) : null))
      .filter((message): message is NormalizedMessage => message !== null);
  }

  const flat = Array.isArray(entry.messages) ? entry.messages : [];
  return flat
    .map((raw, index) => (isRecord(raw) ? toNormalizedMessage(raw, `msg-${index}`) : null))
    .filter((message): message is NormalizedMessage => message !== null);
}

export function parseConversationEntry(
  entry: unknown,
  sourceKind: string,
  sourceRef?: string
): NormalizedConversation | null {
  if (!isRecord(entry)) return null;

  const messages = readMessages(entry);
  if (messages.length === 0) return null;

  const createdAt = asNumber(entry.create_time) ?? messages[0]?.createdAt;
  const updatedAt = asNumber(entry.update_time) ?? messages[messages.length - 1]?.createdAt ?? createdAt;
  const title = asString(entry.title) || deriveTitle(messages);
  const conversationId =
    asString(entry.conversation_id) ||
    asString(entry.id) ||
    `derived-${shortHash(`${title}|${createdAt ?? 0}|${messages.length}`)}`;

  return { conversationId, title, createdAt, updatedAt, messages, sourceKind, sourceRef };
}

function deriveTitle(messages: NormalizedMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const source = (firstUser || messages[0])?.content || "";
  const firstLine = source.split("\n").find((line) => line.trim().length > 0) || "Untitled conversation";
  const trimmed = firstLine.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57).trim()}...` : trimmed;
}

/** Accept `[...]`, `{ conversations: [...] }` or a single conversation object. */
function toEntryArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.conversations)) return parsed.conversations;
    if (isRecord(parsed.mapping) || Array.isArray(parsed.messages)) return [parsed];
  }
  return [];
}

export class ChatGPTExportParser {
  /** Parse raw JSON text from an export into normalized conversations. */
  parse(json: string, sourceKind = "official-export", sourceRef?: string): ParsedExport {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { conversations: [], warnings: [{ reason: `Invalid JSON: ${reason}` }], totalEntries: 0 };
    }
    return this.parseValue(parsed, sourceKind, sourceRef);
  }

  parseValue(parsed: unknown, sourceKind = "official-export", sourceRef?: string): ParsedExport {
    const entries = toEntryArray(parsed);
    const conversations: NormalizedConversation[] = [];
    const warnings: ParseWarning[] = [];

    entries.forEach((entry, index) => {
      try {
        const conversation = parseConversationEntry(entry, sourceKind, sourceRef);
        if (conversation) {
          conversations.push(conversation);
          return;
        }
        warnings.push({
          conversationId: isRecord(entry) ? asString(entry.conversation_id) || asString(entry.id) : undefined,
          reason: `Entry ${index} contained no readable messages`,
        });
      } catch (error) {
        warnings.push({
          reason: `Entry ${index} failed to parse: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });

    return { conversations, warnings, totalEntries: entries.length };
  }
}
