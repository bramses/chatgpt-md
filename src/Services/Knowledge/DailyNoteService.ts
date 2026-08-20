import { CapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { joinPath, upsertManagedBlock } from "src/Utilities/KnowledgeText";
import { Logger } from "src/Utilities/Logger";

/**
 * The temporal layer.
 *
 * Daily notes get lightweight *references* to what was captured or learned on a
 * day - never the conversations themselves. The knowledge lives in its own
 * notes; the daily note is an index into the day, which is what makes Calendar
 * and the daily-note workflow useful without turning them into a dumping
 * ground.
 */

const BLOCK_ID = "daily-knowledge";
const HEADING = "## Knowledge captured";

export interface DailyNoteSettings {
  folder: string;
  format: string;
}

export const DEFAULT_DAILY_SETTINGS: DailyNoteSettings = { folder: "", format: "YYYY-MM-DD" };

/** Read Obsidian's own daily-note configuration; fall back to its defaults. */
export function parseDailyNoteSettings(raw: string | null): DailyNoteSettings {
  if (!raw) return DEFAULT_DAILY_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as { folder?: unknown; format?: unknown };
    return {
      folder: typeof parsed.folder === "string" ? parsed.folder : "",
      format: typeof parsed.format === "string" && parsed.format ? parsed.format : DEFAULT_DAILY_SETTINGS.format,
    };
  } catch {
    return DEFAULT_DAILY_SETTINGS;
  }
}

/** Only the tokens Obsidian's default daily-note formats actually use. */
export function formatDailyNoteName(date: Date, format: string): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()).padStart(4, "0"),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
  };
  return format.replace(/YYYY|MM|DD/g, (token) => values[token] ?? token);
}

export interface DailyReference {
  path: string;
  title: string;
  kind: string;
}

export class DailyNoteService {
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async resolvePath(store: KnowledgeFileStore, date = this.clock()): Promise<string> {
    const settings = parseDailyNoteSettings(await store.read(".obsidian/daily-notes.json"));
    return joinPath(settings.folder, `${formatDailyNoteName(date, settings.format)}.md`);
  }

  /**
   * Add references to today's daily note.
   *
   * `createIfMissing` stays false for background imports: a bulk import of ten
   * years of history must not manufacture ten years of daily notes.
   */
  async recordKnowledge(
    store: KnowledgeFileStore,
    capabilities: CapabilityFlags,
    references: DailyReference[],
    options: { createIfMissing?: boolean; date?: Date } = {}
  ): Promise<string | null> {
    if (!capabilities["daily-notes"] || references.length === 0) return null;

    const path = await this.resolvePath(store, options.date ?? this.clock());
    const existing = await store.read(path);
    if (existing === null && !options.createIfMissing) {
      Logger.debug("[ChatGPT MD] No daily note for today; nothing appended", { path });
      return null;
    }

    const body = references
      .map((reference) => `- ${reference.kind}: [[${reference.path.replace(/\.md$/i, "")}|${reference.title}]]`)
      .join("\n");

    const content = upsertManagedBlock(
      existing ?? `# ${path.split("/").pop()?.replace(/\.md$/i, "")}\n\n`,
      BLOCK_ID,
      HEADING,
      body
    );
    await store.write(path, content);
    return path;
  }
}
