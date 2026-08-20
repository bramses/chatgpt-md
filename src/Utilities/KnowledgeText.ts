/**
 * Pure text helpers for the knowledge importer.
 *
 * Two rules drive everything here:
 * 1. Human-authored content always wins - generated content lives inside
 *    clearly delimited managed blocks that can be rewritten safely.
 * 2. Nothing is destructive: unknown frontmatter keys, unknown sections and
 *    manual prose are preserved verbatim.
 */

export const AUTO_BLOCK_START = "<!-- chatgpt-md:auto:start";
export const AUTO_BLOCK_END = "<!-- chatgpt-md:auto:end";

const FILENAME_INVALID = /[\\/:*?"<>|#^[\]]/g;

/** Sanitize a note title into a filesystem-safe base name. */
export function sanitizeNoteName(title: string): string {
  const cleaned = (title || "")
    .replace(FILENAME_INVALID, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  const truncated = cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
  return truncated || "Untitled";
}

/** Join path segments with forward slashes and no empty or duplicated parts. */
export function joinPath(...parts: (string | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter((part) => part.length > 0)
    .join("/");
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "my",
  "me",
  "i",
  "is",
  "am",
  "are",
  "being",
  "be",
  "in",
  "on",
  "for",
  "and",
  "that",
  "this",
  "it",
  "with",
  "about",
]);

/**
 * Map surface variants onto a shared stem so that "Fear of judgment",
 * "fear of being judged" and "judgment anxiety" collapse to the same key,
 * without collapsing genuinely different concepts.
 */
const CONCEPT_SYNONYMS: Record<string, string> = {
  judged: "judgment",
  judging: "judgment",
  judgement: "judgment",
  judgment: "judgment",
  anxiety: "fear",
  afraid: "fear",
  scared: "fear",
  fears: "fear",
  fear: "fear",
  avoiding: "avoidance",
  avoid: "avoidance",
  avoidant: "avoidance",
  controlling: "control",
  controls: "control",
  perfection: "perfectionism",
  perfectionist: "perfectionism",
  uncertain: "uncertainty",
  uncertainties: "uncertainty",
  trusting: "trust",
  reassure: "reassurance",
  reassuring: "reassurance",
  ruminating: "rumination",
  ruminate: "rumination",
  urgent: "urgency",
  attached: "attachment",
  intimate: "intimacy",
  dreams: "dream",
  dreaming: "dream",
};

export function normalizeConceptKey(title: string): string {
  const tokens = (title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => CONCEPT_SYNONYMS[token] || token)
    .filter((token) => !STOP_WORDS.has(token));

  const unique = [...new Set(tokens)].sort();
  return unique.join("-") || (title || "").trim().toLowerCase();
}

/** Jaccard similarity over normalized tokens; used as a merge hint only. */
export function conceptSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeConceptKey(a).split("-").filter(Boolean));
  const tokensB = new Set(normalizeConceptKey(b).split("-").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) shared++;
  });
  return shared / (tokensA.size + tokensB.size - shared);
}

export interface ParsedNote {
  frontmatter: string[];
  body: string;
  hasFrontmatter: boolean;
}

/** Split a note into raw frontmatter lines and body, preserving both verbatim. */
export function splitNote(content: string): ParsedNote {
  const normalized = (content || "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: [], body: normalized, hasFrontmatter: false };
  }
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: [], body: normalized, hasFrontmatter: false };
  }
  const frontmatter = normalized.slice(4, end).split("\n");
  const rest = normalized.slice(end + 4).replace(/^\n+/, "");
  return { frontmatter, body: rest, hasFrontmatter: true };
}

export function joinNote(note: ParsedNote): string {
  if (note.frontmatter.length === 0) return note.body;
  return `---\n${note.frontmatter.join("\n")}\n---\n\n${note.body.replace(/^\n+/, "")}`;
}

export type FrontmatterValue = string | number | boolean | string[] | Record<string, string>[] | null | undefined;

function quoteScalar(value: string): string {
  const text = String(value ?? "");
  if (text === "") return '""';
  if (/^[A-Za-z0-9][A-Za-z0-9 _.\-/]*$/.test(text) && !/^(true|false|null|yes|no|on|off)$/i.test(text)) {
    return text;
  }
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeValue(key: string, value: FrontmatterValue): string[] {
  if (value === null || value === undefined) return [`${key}:`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    if (typeof value[0] === "string") {
      return [`${key}:`, ...(value as string[]).map((entry) => `  - ${quoteScalar(entry)}`)];
    }
    const lines = [`${key}:`];
    (value as Record<string, string>[]).forEach((entry) => {
      Object.entries(entry).forEach(([entryKey, entryValue], index) => {
        lines.push(`${index === 0 ? "  - " : "    "}${entryKey}: ${quoteScalar(String(entryValue))}`);
      });
    });
    return lines;
  }
  if (typeof value === "number" || typeof value === "boolean") return [`${key}: ${value}`];
  return [`${key}: ${quoteScalar(value)}`];
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Insert or replace only the given top-level frontmatter keys.
 * Every other line - including complex YAML we do not understand - is kept
 * exactly as the user wrote it.
 */
export function upsertFrontmatterFields(content: string, fields: Record<string, FrontmatterValue>): string {
  const note = splitNote(content);
  const lines = [...note.frontmatter];

  for (const [key, value] of Object.entries(fields)) {
    const serialized = serializeValue(key, value);
    const startIndex = lines.findIndex((line) => new RegExp(`^${escapeForRegExp(key)}\\s*:`).test(line));
    if (startIndex === -1) {
      lines.push(...serialized);
      continue;
    }
    let endIndex = startIndex + 1;
    while (endIndex < lines.length && /^(\s+\S|\s*-\s)/.test(lines[endIndex])) endIndex++;
    lines.splice(startIndex, endIndex - startIndex, ...serialized);
  }

  return joinNote({ ...note, frontmatter: lines, hasFrontmatter: true });
}

export function readFrontmatterValue(content: string, key: string): string | undefined {
  const note = splitNote(content);
  const line = note.frontmatter.find((entry) => new RegExp(`^${escapeForRegExp(key)}\\s*:`).test(entry));
  if (!line) return undefined;
  const value = line.slice(line.indexOf(":") + 1).trim();
  return value.replace(/^"(.*)"$/, "$1") || undefined;
}

function blockMarkers(blockId: string): { start: string; end: string } {
  return { start: `${AUTO_BLOCK_START} id=${blockId} -->`, end: `${AUTO_BLOCK_END} id=${blockId} -->` };
}

/** Read the current content of a managed block, or null when absent. */
export function readManagedBlock(content: string, blockId: string): string | null {
  const { start, end } = blockMarkers(blockId);
  const startIndex = content.indexOf(start);
  if (startIndex === -1) return null;
  const endIndex = content.indexOf(end, startIndex);
  if (endIndex === -1) return null;
  return content.slice(startIndex + start.length, endIndex).replace(/^\n+|\n+$/g, "");
}

/**
 * Replace a managed block in place, or append it under `heading` when the note
 * does not have the block yet. Content outside the markers is never touched.
 */
export function upsertManagedBlock(content: string, blockId: string, heading: string, blockBody: string): string {
  const { start, end } = blockMarkers(blockId);
  const rendered = `${start}\n${blockBody.trim()}\n${end}`;
  const startIndex = content.indexOf(start);
  if (startIndex !== -1) {
    const endIndex = content.indexOf(end, startIndex);
    if (endIndex !== -1) {
      return `${content.slice(0, startIndex)}${rendered}${content.slice(endIndex + end.length)}`;
    }
  }
  const separator = content.endsWith("\n") ? "" : "\n";
  const headingLine = heading ? `${heading}\n\n` : "";
  return `${content}${separator}\n${headingLine}${rendered}\n`;
}

/** Build an obsidian:// URL that opens a file in another vault. */
export function obsidianUri(vaultName: string, filePath: string): string {
  const file = filePath.replace(/\.md$/i, "");
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}

export function toWikiLink(title: string): string {
  return `[[${(title || "").replace(/[[\]|]/g, "")}]]`;
}

/** Collapse whitespace so hashes are stable across trivial reformatting. */
export function normalizeForHash(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(text: string, maxLength: number): string {
  const value = (text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function toDate(timestampSeconds?: number): Date | null {
  if (!timestampSeconds || !Number.isFinite(timestampSeconds)) return null;
  const millis = timestampSeconds > 1e11 ? timestampSeconds : timestampSeconds * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoDate(timestampSeconds?: number): string | undefined {
  return toDate(timestampSeconds)?.toISOString().slice(0, 10);
}

export function isoDateTime(timestampSeconds?: number): string | undefined {
  return toDate(timestampSeconds)?.toISOString();
}

export function yearOf(isoLike: string | undefined): string {
  if (!isoLike) return "undated";
  const match = isoLike.match(/^(\d{4})/);
  return match ? match[1] : "undated";
}
