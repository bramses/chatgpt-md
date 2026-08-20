import { ChatGPTExportParser } from "../ChatGPTExportParser";
import { SourceFileReader } from "../SourceFileReader";
import { extractZipEntry, findConversationsEntry, listZipEntries } from "../ZipReader";
import { ConversationBatch, ConversationIngestionAdapter } from "./ConversationSource";
import { Logger } from "src/Utilities/Logger";

/**
 * Reads the official ChatGPT export: either the downloaded ZIP or the
 * `conversations.json` inside it. Used both for the historical bootstrap and
 * later for reconciliation runs.
 */
export class OfficialExportAdapter implements ConversationIngestionAdapter {
  readonly kind = "official-export";

  constructor(
    private readonly refs: string[],
    private readonly reader: SourceFileReader,
    private readonly parser: ChatGPTExportParser = new ChatGPTExportParser()
  ) {}

  describe(): string {
    return `Official ChatGPT export (${this.refs.length} file${this.refs.length === 1 ? "" : "s"})`;
  }

  async load(): Promise<ConversationBatch[]> {
    const batches: ConversationBatch[] = [];
    for (const ref of this.refs) {
      batches.push(await this.loadOne(ref));
    }
    return batches;
  }

  private async loadOne(ref: string): Promise<ConversationBatch> {
    const stat = await this.reader.stat(ref);
    try {
      const json = ref.toLowerCase().endsWith(".zip") ? await this.readFromZip(ref) : await this.reader.readText(ref);
      const parsed = this.parser.parse(json, this.kind, ref);
      return {
        ref,
        conversations: parsed.conversations,
        warnings: parsed.warnings,
        totalEntries: parsed.totalEntries,
        size: stat?.size,
        mtime: stat?.mtime,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      Logger.error("[ChatGPT MD] Failed to read ChatGPT export", { ref, reason });
      return {
        ref,
        conversations: [],
        warnings: [{ reason: `Could not read ${ref}: ${reason}` }],
        totalEntries: 0,
        size: stat?.size,
        mtime: stat?.mtime,
      };
    }
  }

  private async readFromZip(ref: string): Promise<string> {
    const data = await this.reader.readBinary(ref);
    const entries = listZipEntries(data);
    const entry = findConversationsEntry(entries);
    if (!entry) {
      throw new Error("No conversations.json found inside the archive");
    }
    return extractZipEntry(data, entry);
  }
}
