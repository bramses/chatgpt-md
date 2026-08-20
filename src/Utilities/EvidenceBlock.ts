import { EvidenceType, isBehavioralEvidence, ProvenanceOrigin } from "src/Models/Knowledge/Epistemics";
import { yearOf } from "./KnowledgeText";

/**
 * The evidence block is how a durable note accumulates history without ever
 * losing or rewriting the past.
 *
 * Every entry carries the unit id it came from, so re-running the importer -
 * with a newer model, a newer processing version, or a second export - merges
 * instead of duplicating. Entries are grouped by year so a note reads as a
 * timeline: what was said in 2024 stays visible next to what was said in 2026.
 *
 * Entries also carry what kind of evidence they are and who produced them, so
 * a note can say honestly how much independent support it actually has.
 */

export interface EvidenceEntry {
  unitId: string;
  conversationId: string;
  date?: string;
  line: string;
  evidenceType?: EvidenceType;
  origin?: ProvenanceOrigin;
}

const MARKER = /<!--\s*unit:([A-Za-z0-9_-]+)\s+conv:(\S+?)(?:\s+ev:([a-z-]+))?(?:\s+src:([a-z-]+))?\s*-->/;
const DATE_IN_LINE = /\*\*(\d{4}-\d{2}-\d{2})\*\*/;

export interface EvidenceInput {
  unitId: string;
  conversationId: string;
  date?: string;
  text: string;
  sourceLink?: string;
  interpretation?: boolean;
  evidenceType?: EvidenceType;
  origin?: ProvenanceOrigin;
}

/** Prefixes that keep the epistemic status of a line visible while reading. */
function linePrefix(input: EvidenceInput): string {
  if (input.origin === "assistant-originated") return "previous AI interpretation - ";
  if (input.evidenceType === "inference" || input.interpretation) return "possible interpretation - ";
  if (isBehavioralEvidence(input.evidenceType)) return "something done - ";
  return "";
}

export function renderEvidenceLine(input: EvidenceInput): string {
  const date = input.date ? `**${input.date}**` : "**undated**";
  const source = input.sourceLink ? ` - source: ${input.sourceLink}` : "";
  const text = input.text.replace(/\s+/g, " ").trim();
  const evidence = input.evidenceType ? ` ev:${input.evidenceType}` : "";
  const origin = input.origin ? ` src:${input.origin}` : "";
  return `- ${date} - ${linePrefix(input)}${text}${source} <!-- unit:${input.unitId} conv:${input.conversationId}${evidence}${origin} -->`;
}

export function parseEvidenceBlock(block: string | null): EvidenceEntry[] {
  if (!block) return [];
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line): EvidenceEntry | null => {
      const marker = line.match(MARKER);
      if (!marker) return null;
      const date = line.match(DATE_IN_LINE)?.[1];
      return {
        unitId: marker[1],
        conversationId: marker[2],
        date,
        line,
        evidenceType: marker[3] as EvidenceType | undefined,
        origin: marker[4] as ProvenanceOrigin | undefined,
      };
    })
    .filter((entry): entry is EvidenceEntry => entry !== null);
}

/** Merge new entries into existing ones; existing lines are never rewritten. */
export function mergeEvidence(existing: EvidenceEntry[], incoming: EvidenceEntry[]): EvidenceEntry[] {
  const byId = new Map<string, EvidenceEntry>();
  existing.forEach((entry) => byId.set(entry.unitId, entry));
  incoming.forEach((entry) => {
    if (!byId.has(entry.unitId)) byId.set(entry.unitId, entry);
  });
  return [...byId.values()];
}

export function renderEvidenceBlock(entries: EvidenceEntry[]): string {
  if (entries.length === 0) return "_No evidence recorded yet._";

  const groups = new Map<string, EvidenceEntry[]>();
  entries.forEach((entry) => {
    const year = yearOf(entry.date);
    groups.set(year, [...(groups.get(year) || []), entry]);
  });

  const years = [...groups.keys()].sort((a, b) => {
    if (a === "undated") return 1;
    if (b === "undated") return -1;
    return a.localeCompare(b);
  });

  const timeline = years
    .map((year) => {
      const lines = groups
        .get(year)!
        .slice()
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((entry) => entry.line);
      return [`### ${year}`, "", ...lines].join("\n");
    })
    .join("\n\n");

  return `${describeIndependence(evidenceIndependence(entries))}\n\n${timeline}`;
}

export function evidenceDateRange(entries: EvidenceEntry[]): { first?: string; last?: string } {
  const dates = entries
    .map((entry) => entry.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  return { first: dates[0], last: dates[dates.length - 1] };
}

export interface EvidenceIndependence {
  mentions: number;
  /** Distinct source conversations. */
  conversations: number;
  /** Conversations clustered into periods of reflection. */
  episodes: number;
  /** Mentions that rest on the person's own words. */
  userGrounded: number;
  /** Mentions that rest on previous AI interpretation, which is not evidence. */
  assistantOriginated: number;
  /** Mentions describing something actually done rather than said. */
  behavioral: number;
}

/** Conversations within this window are treated as one period of reflection. */
export const EPISODE_WINDOW_DAYS = 7;

function toDayNumber(date: string): number | null {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86400000) : null;
}

/**
 * Ten conversations across three days about one event are one period of
 * intense reflection, not ten independent confirmations. This is what keeps a
 * note from mistaking repetition for support.
 */
export function evidenceIndependence(entries: EvidenceEntry[]): EvidenceIndependence {
  const conversations = new Set(entries.map((entry) => entry.conversationId));

  const days = [
    ...new Set(
      entries.map((entry) => (entry.date ? toDayNumber(entry.date) : null)).filter((day): day is number => day !== null)
    ),
  ].sort((a, b) => a - b);

  let episodes = 0;
  let clusterEnd = -Infinity;
  days.forEach((day) => {
    if (day - clusterEnd > EPISODE_WINDOW_DAYS) episodes++;
    clusterEnd = day;
  });
  const undated = entries.some((entry) => !entry.date);
  if (undated) episodes++;

  return {
    mentions: entries.length,
    conversations: conversations.size,
    episodes: Math.max(episodes, entries.length > 0 ? 1 : 0),
    userGrounded: entries.filter((entry) => entry.origin !== "assistant-originated").length,
    assistantOriginated: entries.filter((entry) => entry.origin === "assistant-originated").length,
    behavioral: entries.filter((entry) => isBehavioralEvidence(entry.evidenceType)).length,
  };
}

/** One honest sentence about how much this note actually rests on. */
export function describeIndependence(stats: EvidenceIndependence): string {
  if (stats.mentions === 0) return "_No evidence recorded yet._";

  const parts = [
    `${stats.mentions} ${stats.mentions === 1 ? "mention" : "mentions"}`,
    `${stats.conversations} ${stats.conversations === 1 ? "conversation" : "conversations"}`,
    `${stats.episodes} ${stats.episodes === 1 ? "period" : "periods"} of reflection`,
  ];
  const extra: string[] = [];
  if (stats.behavioral > 0) extra.push(`${stats.behavioral} describing something done`);
  if (stats.assistantOriginated > 0) {
    extra.push(`${stats.assistantOriginated} resting on previous AI interpretation rather than evidence`);
  }

  return `_${parts.join(", ")}${extra.length > 0 ? `; ${extra.join(", ")}` : ""}. Frequency reflects how often this was written about, not how important or true it is._`;
}
