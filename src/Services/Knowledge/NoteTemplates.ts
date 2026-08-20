import { SemanticUnit } from "src/Models/Knowledge/SemanticUnit";

/**
 * Scaffolds for generated notes.
 *
 * Every scaffold leaves room for the person to write: the human sections come
 * first and are never touched again. Generated content lives only inside the
 * managed blocks that the writer maintains.
 */

export const BLOCK_EVIDENCE = "evidence";
export const BLOCK_RELATED = "related";
export const BLOCK_SUMMARY = "summary";
export const BLOCK_DREAM = "dream";
export const BLOCK_APPEARANCES = "appearances";
export const BLOCK_TENSION = "tension";
export const BLOCK_AS_WRITTEN = "as-written";

const HINT = "_Written by you. The importer never edits text outside the marked blocks._";

export function conceptScaffold(title: string): string {
  return [`# ${title}`, "", "## What I mean by this", "", HINT, "", "## How it appears in my life", "", ""].join("\n");
}

export function dreamScaffold(title: string): string {
  return [`# ${title}`, "", "## Notes to myself", "", HINT, "", ""].join("\n");
}

export function personScaffold(name: string): string {
  return [`# ${name}`, "", "## Relationship", "", HINT, "", "## Shared experiences", "", ""].join("\n");
}

export function mediaScaffold(title: string): string {
  return [`# ${title}`, "", "## Why it matters to me", "", HINT, "", ""].join("\n");
}

export function symbolScaffold(title: string): string {
  return [`# ${title}`, "", "## What this brings up for me", "", HINT, "", ""].join("\n");
}

export function projectScaffold(title: string): string {
  return [`# ${title}`, "", "## Notes", "", HINT, "", ""].join("\n");
}

export function fragmentScaffold(title: string): string {
  return [`# ${title}`, "", "_Kept because it was worth keeping. It does not have to mean anything._", "", ""].join(
    "\n"
  );
}

export function horizonScaffold(title: string): string {
  return [`# ${title}`, "", "## Why this is interesting", "", HINT, "", ""].join("\n");
}

export function scaffoldFor(unit: SemanticUnit, title: string): string {
  switch (unit.kind) {
    case "fragment":
    case "strange-connection":
      return fragmentScaffold(title);
    case "horizon":
    case "experiment":
      return horizonScaffold(title);
    case "dream":
      return dreamScaffold(title);
    case "person":
      return personScaffold(title);
    case "media":
      return mediaScaffold(title);
    case "project-decision":
    case "project-knowledge":
      return projectScaffold(title);
    default:
      return conceptScaffold(title);
  }
}

export function headingFor(blockId: string): string {
  switch (blockId) {
    case BLOCK_EVIDENCE:
      return "## Evidence / Sources";
    case BLOCK_RELATED:
      return "## Related";
    case BLOCK_SUMMARY:
      return "## Summary";
    case BLOCK_DREAM:
      return "## Dream";
    case BLOCK_APPEARANCES:
      return "## Appears in";
    case BLOCK_TENSION:
      return "## Tension";
    case BLOCK_AS_WRITTEN:
      return "## As written";
    default:
      return "";
  }
}

/** Language guard: interpretations are always marked as such, never asserted. */
export const INTERPRETATION_DISCLAIMER =
  "_Possible readings only, not conclusions. Symbols are associations that recur, not meanings that are proven._";
