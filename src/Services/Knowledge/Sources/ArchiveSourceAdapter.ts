import { NormalizedConversation, NormalizedMessage, NormalizedRole } from "src/Models/Knowledge/ChatGPTExport";
import { KnowledgeFileStore } from "../KnowledgeFileStore";
import { ConversationBatch, ConversationIngestionAdapter } from "./ConversationSource";
import { readFrontmatterValue, splitNote } from "src/Utilities/KnowledgeText";

/**
 * Reads conversations back out of the immutable source archive.
 *
 * This is what makes reprocessing cheap: improving extraction or routing does
 * not require the original export to still be around, and never rewrites the
 * archived sources. The archive is the system of record.
 */

const HEADING = /^##\s+(User|Assistant|System|Tool)\s*$/i;
const MESSAGE_MARKER = /^<!--\s*(\S+)?\s*\|\s*message-id:\s*(\S+)\s*-->$/;

export class ArchiveSourceAdapter implements ConversationIngestionAdapter {
  readonly kind = "source-archive";

  constructor(
    private readonly store: KnowledgeFileStore,
    private readonly archiveFolder: string,
    private readonly conversationIds?: Set<string>
  ) {}

  describe(): string {
    return `Source archive (${this.store.vaultName}/${this.archiveFolder})`;
  }

  async load(): Promise<ConversationBatch[]> {
    const files = await this.store.listFiles(this.archiveFolder, { extension: ".md", recursive: true, limit: 100000 });
    const conversations: NormalizedConversation[] = [];
    const warnings: { conversationId?: string; reason: string }[] = [];

    for (const file of files) {
      const content = await this.store.read(file);
      if (!content) continue;
      const conversation = parseArchivedConversation(content, this.kind, file);
      if (!conversation) {
        warnings.push({ reason: `Archived note could not be read back: ${file}` });
        continue;
      }
      if (this.conversationIds && !this.conversationIds.has(conversation.conversationId)) continue;
      conversations.push(conversation);
    }

    return [{ ref: this.archiveFolder, conversations, warnings, totalEntries: files.length }];
  }
}

export function parseArchivedConversation(
  content: string,
  sourceKind: string,
  sourceRef: string
): NormalizedConversation | null {
  const conversationId = readFrontmatterValue(content, "conversation_id");
  if (!conversationId) return null;

  const title = readFrontmatterValue(content, "title") || "Untitled conversation";
  const created = readFrontmatterValue(content, "created");
  const updated = readFrontmatterValue(content, "updated");

  const body = splitNote(content).body;
  const messages: NormalizedMessage[] = [];
  let role: NormalizedRole | null = null;
  let messageId: string | undefined;
  let buffer: string[] = [];

  const flush = (): void => {
    if (!role) return;
    const text = buffer.join("\n").trim();
    if (text) messages.push({ id: messageId || `${conversationId}-${messages.length}`, role, content: text });
    buffer = [];
    messageId = undefined;
  };

  body.split("\n").forEach((line) => {
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      role = heading[1].toLowerCase() as NormalizedRole;
      return;
    }
    const marker = line.match(MESSAGE_MARKER);
    if (marker && buffer.length === 0) {
      messageId = marker[2];
      return;
    }
    if (role) buffer.push(line);
  });
  flush();

  if (messages.length === 0) return null;

  return {
    conversationId,
    title,
    createdAt: toSeconds(created),
    updatedAt: toSeconds(updated) ?? toSeconds(created),
    messages,
    sourceKind,
    sourceRef,
  };
}

function toSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : undefined;
}
