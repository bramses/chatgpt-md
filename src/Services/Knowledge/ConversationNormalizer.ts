import { NormalizedConversation, NormalizedMessage } from "src/Models/Knowledge/ChatGPTExport";
import { stableHash, shortHash } from "src/Utilities/KnowledgeHashing";
import { isoDate, isoDateTime, joinPath, normalizeForHash, sanitizeNoteName } from "src/Utilities/KnowledgeText";

/**
 * Layer A of the architecture: the immutable source archive.
 *
 * Every conversation is rendered to one canonical Markdown document. The
 * rendering is deterministic so the content hash only changes when the
 * conversation itself changed - which is what drives incremental re-processing.
 */

const ROLE_HEADINGS: Record<string, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};

export interface SourceDocument {
  conversationId: string;
  title: string;
  path: string;
  content: string;
  contentHash: string;
  createdIso?: string;
  updatedIso?: string;
  messageCount: number;
}

export class ConversationNormalizer {
  /** Content hash over the conversation's meaning-bearing content only. */
  contentHash(conversation: NormalizedConversation): string {
    const payload = [
      conversation.conversationId,
      conversation.title,
      ...conversation.messages.map((message) => `${message.role}:${normalizeForHash(message.content)}`),
    ].join("\n--\n");
    return stableHash(payload);
  }

  /** Stable, collision-resistant archive path: year folder + date + title + id. */
  archivePath(conversation: NormalizedConversation, archiveFolder: string): string {
    const created = isoDate(conversation.createdAt);
    const year = created ? created.slice(0, 4) : "undated";
    const datePrefix = created ? `${created} ` : "";
    const name = sanitizeNoteName(`${datePrefix}${conversation.title}`);
    const suffix = shortHash(conversation.conversationId).slice(0, 8);
    return joinPath(archiveFolder, year, `${name} (${suffix}).md`);
  }

  renderBody(conversation: NormalizedConversation): string {
    const lines: string[] = [`# ${conversation.title}`, ""];
    conversation.messages.forEach((message) => {
      lines.push(`## ${ROLE_HEADINGS[message.role] || "Assistant"}`);
      const timestamp = isoDateTime(message.createdAt);
      if (timestamp) lines.push(`<!-- ${timestamp} | message-id: ${message.id} -->`);
      lines.push("");
      lines.push(message.content.trim());
      lines.push("");
    });
    return lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd();
  }

  build(
    conversation: NormalizedConversation,
    options: { archiveFolder: string; importedAt: string; processingVersion: number; processed?: boolean }
  ): SourceDocument {
    const contentHash = this.contentHash(conversation);
    const createdIso = isoDateTime(conversation.createdAt);
    const updatedIso = isoDateTime(conversation.updatedAt);

    const frontmatter = [
      "---",
      "type: chatgpt-source",
      `conversation_id: ${quote(conversation.conversationId)}`,
      `title: ${quote(conversation.title)}`,
      `created: ${createdIso || ""}`,
      `updated: ${updatedIso || ""}`,
      `imported: ${options.importedAt}`,
      `source: ${quote(conversation.sourceKind || "chatgpt-export")}`,
      `processed: ${options.processed === true}`,
      `processing_version: ${options.processingVersion}`,
      `content_hash: ${contentHash}`,
      `message_count: ${conversation.messages.length}`,
      "---",
      // Two blank lines match what `upsertFrontmatterFields` produces, so
      // flipping `processed` after analysis does not leave the archived note
      // different from what a later run would build for the same conversation.
      "",
      "",
    ].join("\n");

    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      path: this.archivePath(conversation, options.archiveFolder),
      content: `${frontmatter}${this.renderBody(conversation)}\n`,
      contentHash,
      createdIso,
      updatedIso,
      messageCount: conversation.messages.length,
    };
  }

  /** Plain transcript used as the model prompt (no frontmatter, bounded roles). */
  renderForAnalysis(messages: NormalizedMessage[]): string {
    return messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => `[${message.id}] ${message.role === "user" ? "USER" : "ASSISTANT"}: ${message.content.trim()}`)
      .join("\n\n");
  }
}

function quote(value: string): string {
  return `"${(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
