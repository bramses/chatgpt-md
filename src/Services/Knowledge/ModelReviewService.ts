import { ConceptRecord } from "src/Models/Knowledge/KnowledgeImportManifest";
import { coerceLifecycle, isSuppressedLifecycle, ModelLifecycle } from "src/Models/Knowledge/Epistemics";
import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { PERSONAL_FOLDERS } from "./PersonalOntology";
import {
  joinPath,
  readFrontmatterValue,
  upsertFrontmatterFields,
  upsertManagedBlock,
} from "src/Utilities/KnowledgeText";
import { Logger } from "src/Utilities/Logger";

/**
 * Lets models about a person die.
 *
 * A knowledge system that only accumulates becomes ideology: every old reading
 * keeps its authority forever and growth can never invalidate it. This service
 * does the opposite work - it surfaces interpretations that may have stopped
 * fitting, and it lets the person retire them without deleting the history.
 *
 * Nothing here decides on the person's behalf. It asks questions and reads back
 * the answer the person wrote in the note.
 */

const BLOCK_REVIEW = "model-review";

export const REVIEW_QUESTIONS: readonly string[] = [
  "Does this still describe anything useful?",
  "Is this mainly historical now?",
  "What evidence would contradict it?",
  "Has the language itself become limiting?",
  "Would letting go of this create more room?",
  "Is it still useful enough to keep appearing in retrieval?",
];

export const REVIEW_OUTCOMES: readonly ModelLifecycle[] = [
  "active",
  "quiet",
  "dormant",
  "historical",
  "contradicted",
  "retired",
];

export interface ModelReviewResult {
  path: string;
  candidates: ConceptRecord[];
  syncedFromNotes: number;
}

export class ModelReviewService {
  constructor(private readonly manifest: ImportManifestService) {}

  /**
   * The person edits `status:` in a note; the vault follows.
   * Human-authored intent always wins over what the importer inferred.
   */
  async syncLifecycleFromNotes(store: KnowledgeFileStore): Promise<number> {
    let synced = 0;
    for (const concept of this.manifest.listConcepts()) {
      if (concept.vaultId !== store.vaultId) continue;
      const content = await store.read(concept.path);
      if (!content) continue;

      const declared = coerceLifecycle(readFrontmatterValue(content, "status"));
      if (!declared || declared === concept.lifecycle) continue;

      this.manifest.setConceptLifecycle(concept.key, declared, "set by hand in the note");
      synced++;
      Logger.debug("[ChatGPT MD] Model lifecycle updated from note", { path: concept.path, declared });
    }
    return synced;
  }

  /** Write a small, finite review sheet. Never the whole vault at once. */
  async writeReviewNote(store: KnowledgeFileStore, limit = 7): Promise<ModelReviewResult> {
    const syncedFromNotes = await this.syncLifecycleFromNotes(store);
    const candidates = this.manifest.conceptsForReview(limit).filter((concept) => concept.vaultId === store.vaultId);
    const path = joinPath(PERSONAL_FOLDERS.system, "Model Review.md");

    const existing =
      (await store.read(path)) ??
      [
        "# Model Review",
        "",
        "Interpretations that have not been looked at in a while.",
        "",
        "Change `status:` in a note to `active`, `quiet`, `dormant`, `historical`, `contradicted` or `retired`.",
        "The next review picks that up. Nothing is ever deleted - retired notes keep their evidence and simply stop being surfaced.",
        "",
        "",
      ].join("\n");

    const body =
      candidates.length === 0
        ? "_Nothing is due for review._"
        : [
            "Questions worth asking about each of these:",
            "",
            ...REVIEW_QUESTIONS.map((question) => `- ${question}`),
            "",
            "| Note | Last written about | Status now |",
            "| --- | --- | --- |",
            ...candidates.map(
              (concept) =>
                `| [[${concept.path.replace(/\.md$/i, "")}\\|${concept.title}]] | ${concept.lastObserved || "unknown"} | ${
                  concept.lifecycle || "active"
                } |`
            ),
            "",
            "_Being wrong about yourself later is a good outcome, not a failure of the archive._",
          ].join("\n");

    let content = upsertManagedBlock(existing, BLOCK_REVIEW, "## Up for review", body);
    content = upsertFrontmatterFields(content, {
      type: "chatgpt-model-review",
      generated_by: "chatgpt-md",
      due_for_review: candidates.length,
      last_review: new Date().toISOString().slice(0, 10),
    });
    await store.write(path, content);
    this.manifest.markModelReview();

    return { path, candidates, syncedFromNotes };
  }

  /** Concepts the vault should stop surfacing, for retrieval and index filters. */
  suppressedPaths(vaultId: string): Set<string> {
    return new Set(
      this.manifest
        .listConcepts()
        .filter((concept) => concept.vaultId === vaultId)
        .filter((concept) => isSuppressedLifecycle(concept.lifecycle) || concept.surfaceInRetrieval === false)
        .map((concept) => concept.path)
    );
  }
}
