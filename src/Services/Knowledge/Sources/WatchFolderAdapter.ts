import { ChatGPTExportParser } from "../ChatGPTExportParser";
import { SourceFileReader } from "../SourceFileReader";
import { extractZipEntry, findConversationsEntry, listZipEntries } from "../ZipReader";
import { ConversationBatch, ConversationIngestionAdapter } from "./ConversationSource";
import { IngestionSourceRecord } from "src/Models/Knowledge/KnowledgeImportManifest";
import { Logger } from "src/Utilities/Logger";

const SUPPORTED = [".json", ".zip"];

/**
 * Continuous ingestion from a drop folder.
 *
 * Anything ChatGPT-shaped that lands in the inbox - a fresh export, a single
 * exported conversation, or a payload written by a future companion app - is
 * picked up, parsed and pushed through exactly the same pipeline as the
 * historical import. Files whose size and mtime are unchanged since the last
 * run are skipped without being read.
 */
export class WatchFolderAdapter implements ConversationIngestionAdapter {
  readonly kind = "watch-folder";

  constructor(
    private readonly folder: string,
    private readonly reader: SourceFileReader,
    private readonly seen: Record<string, IngestionSourceRecord> = {},
    private readonly parser: ChatGPTExportParser = new ChatGPTExportParser()
  ) {}

  describe(): string {
    return `ChatGPT inbox folder (${this.folder})`;
  }

  async load(): Promise<ConversationBatch[]> {
    if (!this.folder) return [];
    const files = (await this.reader.listFiles(this.folder)).filter((file) =>
      SUPPORTED.some((extension) => file.toLowerCase().endsWith(extension))
    );

    const batches: ConversationBatch[] = [];
    for (const file of files) {
      const stat = await this.reader.stat(file);
      const previous = this.seen[file];
      if (previous && stat && previous.size === stat.size && previous.mtime === stat.mtime) {
        Logger.debug("[ChatGPT MD] Inbox file unchanged, skipping", { file });
        continue;
      }
      batches.push(await this.readFile(file, stat?.size, stat?.mtime));
    }
    return batches;
  }

  private async readFile(file: string, size?: number, mtime?: number): Promise<ConversationBatch> {
    try {
      const json = file.toLowerCase().endsWith(".zip")
        ? await this.readFromZip(file)
        : await this.reader.readText(file);
      const parsed = this.parser.parse(json, this.kind, file);
      return {
        ref: file,
        conversations: parsed.conversations,
        warnings: parsed.warnings,
        totalEntries: parsed.totalEntries,
        size,
        mtime,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return {
        ref: file,
        conversations: [],
        warnings: [{ reason: `Could not read ${file}: ${reason}` }],
        totalEntries: 0,
        size,
        mtime,
      };
    }
  }

  private async readFromZip(ref: string): Promise<string> {
    const data = await this.reader.readBinary(ref);
    const entry = findConversationsEntry(listZipEntries(data));
    if (!entry) throw new Error("No conversations.json found inside the archive");
    return extractZipEntry(data, entry);
  }
}
