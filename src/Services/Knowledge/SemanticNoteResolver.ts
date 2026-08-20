import { SemanticUnit } from "src/Models/Knowledge/SemanticUnit";
import { KnowledgeLayer } from "src/Models/Knowledge/Epistemics";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { ImportManifestService } from "./ImportManifestService";
import { conceptSimilarity, joinPath, normalizeConceptKey, sanitizeNoteName } from "src/Utilities/KnowledgeText";

/**
 * Finds the durable note a unit belongs to.
 *
 * The point is to end up with one "Control" note that accumulates evidence,
 * not "Control 2.md" and "Control August.md". Resolution walks from cheapest
 * and safest to fuzziest:
 *
 * 1. the concept registry (normalized title and known aliases),
 * 2. an existing note in the destination folder with the same normalized title,
 * 3. a sufficiently similar existing note title,
 * 4. otherwise a new note.
 *
 * The similarity gate is deliberately strict: merging two genuinely different
 * concepts is worse than keeping two notes.
 */

export interface ResolvedNote {
  path: string;
  title: string;
  isNew: boolean;
  matchedBy: "registry" | "alias" | "exact-title" | "similarity" | "new";
  key: string;
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.82;

export class SemanticNoteResolver {
  constructor(
    private readonly manifest: ImportManifestService,
    private readonly similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD
  ) {}

  static registryKey(vaultId: string, title: string): string {
    return `${vaultId}:${normalizeConceptKey(title)}`;
  }

  async resolve(
    unit: SemanticUnit,
    vaultId: string,
    folder: string,
    store: KnowledgeFileStore,
    titleOverride?: string
  ): Promise<ResolvedNote> {
    const title = (titleOverride || unit.title || "Untitled").trim();
    const key = SemanticNoteResolver.registryKey(vaultId, title);

    const registered = this.manifest.getConcept(key);
    if (registered && (await store.exists(registered.path))) {
      return { path: registered.path, title: registered.title, isNew: false, matchedBy: "registry", key };
    }

    const aliasMatch = this.manifest
      .listConcepts()
      .find(
        (concept) =>
          concept.vaultId === vaultId &&
          concept.aliases.some((alias) => normalizeConceptKey(alias) === normalizeConceptKey(title))
      );
    if (aliasMatch && (await store.exists(aliasMatch.path))) {
      return { path: aliasMatch.path, title: aliasMatch.title, isNew: false, matchedBy: "alias", key: aliasMatch.key };
    }

    const existing = await store.listFiles(folder, { extension: ".md", limit: 500 });
    const normalizedTitle = normalizeConceptKey(title);

    const exact = existing.find((path) => normalizeConceptKey(baseName(path)) === normalizedTitle);
    if (exact) return { path: exact, title: baseName(exact), isNew: false, matchedBy: "exact-title", key };

    let best: { path: string; score: number } | undefined;
    existing.forEach((path) => {
      const score = conceptSimilarity(baseName(path), title);
      if (score >= this.similarityThreshold && (!best || score > best.score)) best = { path, score };
    });
    if (best) return { path: best.path, title: baseName(best.path), isNew: false, matchedBy: "similarity", key };

    return { path: joinPath(folder, `${sanitizeNoteName(title)}.md`), title, isNew: true, matchedBy: "new", key };
  }

  /**
   * Record the resolution so later runs find the same note without scanning.
   * New interpretations start as "emerging" rather than as settled knowledge.
   */
  register(
    resolved: ResolvedNote,
    vaultId: string,
    kind: string,
    surfaceTitle: string,
    observedOn?: string,
    layer?: KnowledgeLayer
  ): void {
    this.manifest.putConcept({
      key: resolved.key,
      title: resolved.title,
      vaultId,
      path: resolved.path,
      aliases: surfaceTitle && surfaceTitle !== resolved.title ? [surfaceTitle] : [],
      kind,
      layer,
      lifecycle: "emerging",
      firstObserved: observedOn,
      lastObserved: observedOn,
    });
  }
}

function baseName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1].replace(/\.md$/i, "");
}
