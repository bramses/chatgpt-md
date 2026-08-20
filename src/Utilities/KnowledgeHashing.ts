/**
 * Deterministic content hashing for the knowledge importer.
 *
 * The importer must be able to answer "have I seen exactly this content
 * before?" thousands of times per run, offline, on desktop and mobile.
 * A 128-bit FNV-1a style digest is enough for change detection (it is not a
 * security primitive and is never used as one).
 */

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index) & 0xff;
    hash = Math.imul(hash, PRIME) >>> 0;
    hash ^= (input.charCodeAt(index) >>> 8) & 0xff;
    hash = Math.imul(hash, PRIME) >>> 0;
  }
  return hash >>> 0;
}

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 32 hex characters derived from four independently seeded FNV-1a passes. */
export function stableHash(input: string): string {
  const text = input ?? "";
  const lengthTag = `:${text.length}`;
  return [
    toHex(fnv1a(text, OFFSET)),
    toHex(fnv1a(`${text}${lengthTag}`, 0x9e3779b1)),
    toHex(fnv1a(`${lengthTag}${text}`, 0x85ebca6b)),
    toHex(fnv1a(text.split("").reverse().join(""), 0xc2b2ae35)),
  ].join("");
}

/** Short, human-readable id for semantic units and log lines. */
export function shortHash(input: string): string {
  return stableHash(input).slice(0, 12);
}
