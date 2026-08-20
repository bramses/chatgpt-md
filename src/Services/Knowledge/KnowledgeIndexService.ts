import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { ImportManifestService } from "./ImportManifestService";
import { ImportRunRecord, ReviewQueueEntry } from "src/Models/Knowledge/KnowledgeImportManifest";
import { matchExistingFolder, PERSONAL_FOLDERS } from "./PersonalOntology";
import { isSuppressedLifecycle, renderBlindSpots } from "src/Models/Knowledge/Epistemics";
import { joinPath, truncate, upsertFrontmatterFields, upsertManagedBlock } from "src/Utilities/KnowledgeText";

/**
 * Indexes, maps of content and the review queue.
 *
 * These are the notes that make the knowledge layer answerable: which symbols
 * recur, which patterns have the most evidence, what still needs a human
 * decision. Everything here is generated inside managed blocks and can be
 * rebuilt at any time without touching what the person wrote.
 */

const BLOCK_INDEX = "index";

const CONCEPT_INDEX_CAVEAT =
  "_Provisional readings of written traces. None of these describe a person, and any of them may stop fitting._";

const FREQUENCY_CAVEAT =
  "_Counts describe how often something was written down, nothing more. Frequency is not significance._";

export interface DreamAtlasStats {
  symbols: Map<string, { count: number; first?: string; last?: string }>;
  emotions: Map<string, number>;
  people: Map<string, number>;
  places: Map<string, number>;
  themes: Map<string, number>;
  dreamCount: number;
}

export class KnowledgeIndexService {
  constructor(private readonly manifest: ImportManifestService) {}

  async rebuild(store: KnowledgeFileStore, folders: string[]): Promise<string[]> {
    const written: string[] = [];
    written.push(await this.writeMapOfContent(store));
    written.push(await this.writeConceptIndexes(store));
    written.push(await this.writeDreamAtlas(store, folders));
    written.push(await this.writeReviewQueue(store));
    return written.filter(Boolean);
  }

  async writeReviewQueue(store: KnowledgeFileStore): Promise<string> {
    const entries = this.manifest.reviewQueue();
    const path = joinPath(PERSONAL_FOLDERS.system, "Review Queue.md");
    const existing =
      (await store.read(path)) ??
      ["# Review Queue", "", "Items the importer would not file on its own.", "", ""].join("\n");

    const body = entries.length === 0 ? "_Nothing is waiting for review._" : renderReviewTable(entries);
    let content = upsertManagedBlock(existing, BLOCK_INDEX, "## Open items", body);
    content = upsertFrontmatterFields(content, {
      type: "chatgpt-review-queue",
      generated_by: "chatgpt-md",
      open_items: entries.length,
    });
    await store.write(path, content);
    return path;
  }

  async writeImportLog(store: KnowledgeFileStore, run: ImportRunRecord, notes: string[]): Promise<string> {
    const path = joinPath(PERSONAL_FOLDERS.importLogs, `${run.startedAt.slice(0, 10)} ${run.runId}.md`);
    const lines = [
      `# Import run ${run.runId}`,
      "",
      `- mode: ${run.mode}`,
      `- started: ${run.startedAt}`,
      `- finished: ${run.finishedAt || "(interrupted)"}`,
      `- conversations seen: ${run.conversationsSeen}`,
      `- source notes written: ${run.conversationsArchived}`,
      `- conversations processed: ${run.conversationsProcessed}`,
      `- skipped (nothing durable): ${run.conversationsSkipped}`,
      `- failed: ${run.conversationsFailed}`,
      `- knowledge units written: ${run.unitsWritten}`,
      `- units queued for review: ${run.unitsQueuedForReview}`,
      `- approximate characters sent to the model: ${run.approxPromptChars}`,
      run.aborted ? "- run was interrupted and can be resumed" : "",
      "",
      ...(notes.length > 0 ? ["## Notes", "", ...notes.map((note) => `- ${note}`)] : []),
      "",
    ].filter((line) => line !== "");

    const content = `---\ntype: chatgpt-import-log\nrun_id: ${run.runId}\ngenerated_by: chatgpt-md\n---\n\n${lines.join("\n")}\n`;
    await store.write(path, content);
    return path;
  }

  private async writeMapOfContent(store: KnowledgeFileStore): Promise<string> {
    const path = joinPath(PERSONAL_FOLDERS.home, "Maps of Content.md");
    const existing = (await store.read(path)) ?? ["# Maps of Content", "", ""].join("\n");
    const body = [
      "_An observatory over written traces, not a description of a person._",
      "",
      "Maintained by the importer:",
      "",
      "- [[Concept Index]] - every durable concept note, grouped by area",
      "- [[Dream Atlas]] - recurring symbols, emotions, people, places and themes",
      "- [[Review Queue]] - what the importer would not decide on its own",
      "- [[Model Review]] - readings that may have stopped fitting",
      "- [[Open Horizon]] - possibilities the archive does not predict",
      "",
      "Yours to write:",
      "",
      "- [[The Good Life]]",
      "- [[Current Chapter]]",
      "- [[Current Questions]]",
    ].join("\n");
    let content = upsertManagedBlock(existing, BLOCK_INDEX, "## Maps", body);
    content = upsertFrontmatterFields(content, { type: "moc", generated_by: "chatgpt-md" });
    await store.write(path, content);
    return path;
  }

  /** One MOC per area, built from the concept registry rather than the disk. */
  private async writeConceptIndexes(store: KnowledgeFileStore): Promise<string> {
    const all = this.manifest.listConcepts().filter((concept) => concept.vaultId === store.vaultId);
    // Retired and historical readings keep their notes but leave the index.
    const concepts = all.filter(
      (concept) => !isSuppressedLifecycle(concept.lifecycle) && concept.surfaceInRetrieval !== false
    );
    const suppressed = all.length - concepts.length;
    const groups = new Map<string, string[]>();

    concepts.forEach((concept) => {
      const area = mocNameForPath(concept.path);
      if (!area) return;
      const link = `- [[${concept.path.replace(/\.md$/i, "")}|${concept.title}]]`;
      groups.set(area, [...(groups.get(area) || []), link]);
    });

    const path = joinPath(PERSONAL_FOLDERS.home, "Concept Index.md");
    const patternLinks = (groups.get("Patterns") || []).sort();
    const otherAreas = [...groups.entries()]
      .filter(([area]) => area !== "Patterns")
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([area, links]) => [`### ${area}`, "", ...links.slice(0, 200).sort()].join("\n"));

    const body = [
      CONCEPT_INDEX_CAVEAT,
      suppressed > 0
        ? `_${suppressed} retired or historical readings are kept on disk but left out of this index._`
        : "",
      patternLinks.length > 0 ? ["### Patterns", "", ...patternLinks.slice(0, 200)].join("\n") : "",
      ...otherAreas,
      renderBlindSpots(),
    ]
      .filter(Boolean)
      .join("\n\n");

    const existing =
      (await store.read(path)) ?? ["# Concept Index", "", "Durable concept notes grouped by area.", "", ""].join("\n");
    let content = upsertManagedBlock(existing, BLOCK_INDEX, "## Concept notes", body || "_No concept notes yet._");
    content = upsertFrontmatterFields(content, {
      type: "moc",
      generated_by: "chatgpt-md",
      concept_count: concepts.length,
    });
    await store.write(path, content);
    return path;
  }

  async writeDreamAtlas(store: KnowledgeFileStore, folders: string[]): Promise<string> {
    const dreamFolder = matchExistingFolder(folders, PERSONAL_FOLDERS.dreams) || PERSONAL_FOLDERS.dreams;
    const stats = await this.collectDreamStats(store, dreamFolder);
    const path = joinPath(PERSONAL_FOLDERS.home, "Dream Atlas.md");
    const existing = (await store.read(path)) ?? ["# Dream Atlas", "", ""].join("\n");

    const body = [
      `Dreams recorded: ${stats.dreamCount}`,
      "",
      FREQUENCY_CAVEAT,
      "",
      "### Recurring symbols",
      "",
      renderSymbolTable(stats.symbols),
      "",
      "### Recurring emotions",
      "",
      renderCounts(stats.emotions),
      "",
      "### Recurring people",
      "",
      renderCounts(stats.people),
      "",
      "### Recurring places",
      "",
      renderCounts(stats.places),
      "",
      "### Recurring themes",
      "",
      renderCounts(stats.themes),
      "",
      renderBlindSpots(),
    ].join("\n");

    let content = upsertManagedBlock(existing, BLOCK_INDEX, "## Atlas", body);
    content = upsertFrontmatterFields(content, {
      type: "moc",
      generated_by: "chatgpt-md",
      dream_count: stats.dreamCount,
    });
    await store.write(path, content);
    return path;
  }

  private async collectDreamStats(store: KnowledgeFileStore, dreamFolder: string): Promise<DreamAtlasStats> {
    const stats: DreamAtlasStats = {
      symbols: new Map(),
      emotions: new Map(),
      people: new Map(),
      places: new Map(),
      themes: new Map(),
      dreamCount: 0,
    };

    const files = await store.listFiles(dreamFolder, { extension: ".md", recursive: true, limit: 5000 });
    for (const file of files) {
      const content = await store.read(file);
      if (!content || !/^type:\s*dream\s*$/m.test(content)) continue;
      stats.dreamCount++;
      const date = readScalar(content, "date");
      readList(content, "symbols").forEach((symbol) => {
        const current = stats.symbols.get(symbol) || { count: 0, first: date, last: date };
        stats.symbols.set(symbol, {
          count: current.count + 1,
          first: minDate(current.first, date),
          last: maxDate(current.last, date),
        });
      });
      countInto(stats.emotions, readList(content, "emotions"));
      countInto(stats.people, readList(content, "people"));
      countInto(stats.places, readList(content, "places"));
      countInto(stats.themes, readList(content, "themes"));
    }

    return stats;
  }
}

function countInto(target: Map<string, number>, values: string[]): void {
  values.forEach((value) => target.set(value, (target.get(value) || 0) + 1));
}

function renderCounts(counts: Map<string, number>): string {
  if (counts.size === 0) return "_Nothing recorded yet._";
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40)
    .map(([value, count]) => `- ${value} (${count})`)
    .join("\n");
}

function renderSymbolTable(symbols: Map<string, { count: number; first?: string; last?: string }>): string {
  if (symbols.size === 0) return "_Nothing recorded yet._";
  const rows = [...symbols.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 60)
    .map(([symbol, data]) => `| [[${symbol}]] | ${data.count} | ${data.first || "-"} | ${data.last || "-"} |`);
  return ["| Symbol | Appearances | First | Last |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

function renderReviewTable(entries: ReviewQueueEntry[]): string {
  const rows = entries
    .slice(-500)
    .map(
      (entry) =>
        `| ${entry.kind} | ${truncate(entry.title, 40)} | ${truncate(entry.excerpt, 90)} | ${entry.chosenVaultId || "-"} | ${entry.confidence} | ${entry.reason} |`
    );
  return [
    "| Kind | Title | Excerpt | Suggested vault | Confidence | Why |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Areas that read better split by their sub-folder in a map of content. */
const SPLIT_AREAS = ["library", "music", "self", "inner life"];

function mocNameForPath(path: string): string | undefined {
  const segments = path.split("/");
  if (segments.length < 2) return undefined;

  const top = segments[0].replace(/^\d+\s*/, "").trim();
  if (!top) return undefined;

  const second = segments.length > 2 ? segments[1] : undefined;
  if (second && SPLIT_AREAS.includes(top.toLowerCase())) return `${top} / ${second}`;
  return top;
}

function readScalar(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  return match[1].trim().replace(/^["']|["']$/g, "") || undefined;
}

function readList(content: string, key: string): string[] {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (index === -1) return [];
  const inline = lines[index].slice(key.length + 1).trim();
  if (inline.startsWith("[")) {
    return inline
      .slice(1, -1)
      .split(",")
      .map((value) => value.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const values: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    if (!/^\s*-\s+/.test(lines[cursor])) break;
    values.push(
      lines[cursor]
        .replace(/^\s*-\s+/, "")
        .replace(/^["']|["']$/g, "")
        .trim()
    );
  }
  return values.filter(Boolean);
}

function minDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
