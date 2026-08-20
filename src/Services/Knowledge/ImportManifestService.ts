import { isSuppressedLifecycle, ModelLifecycle } from "src/Models/Knowledge/Epistemics";
import {
  AskedQuestionRecord,
  ConceptRecord,
  ConversationRecord,
  createEmptyManifest,
  ImportRunRecord,
  IngestionSourceRecord,
  KnowledgeImportManifest,
  KnowledgeStatus,
  KNOWLEDGE_PROCESSING_VERSION,
  ReviewQueueEntry,
} from "src/Models/Knowledge/KnowledgeImportManifest";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { Logger } from "src/Utilities/Logger";

/**
 * Durable import state.
 *
 * Conversation ids plus content hashes - never filenames - decide what is new,
 * what changed, and what is already done. This is what makes the importer
 * resumable, idempotent, and safe to point at a second export later.
 *
 * The manifest lives with the plugin (not in a knowledge vault) so that
 * re-running the importer never depends on the archive vault being reachable.
 */
export class ImportManifestService {
  private manifest: KnowledgeImportManifest;
  private dirty = false;

  constructor(
    private readonly store: KnowledgeFileStore,
    private readonly manifestPath: string,
    private readonly now: () => string = () => new Date().toISOString()
  ) {
    this.manifest = createEmptyManifest(this.now());
  }

  async load(): Promise<KnowledgeImportManifest> {
    try {
      const raw = await this.store.read(this.manifestPath);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<KnowledgeImportManifest>;
        this.manifest = { ...createEmptyManifest(this.now()), ...parsed };
        this.manifest.conversations = this.manifest.conversations || {};
        this.manifest.concepts = this.manifest.concepts || {};
        this.manifest.reviewQueue = this.manifest.reviewQueue || [];
        this.manifest.ingestionSources = this.manifest.ingestionSources || {};
        this.manifest.runs = this.manifest.runs || [];
        this.manifest.questionLog = this.manifest.questionLog || [];
      }
    } catch (error) {
      Logger.error("[ChatGPT MD] Could not read knowledge manifest, starting a new one", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.manifest = createEmptyManifest(this.now());
    }
    return this.manifest;
  }

  get(): KnowledgeImportManifest {
    return this.manifest;
  }

  markDirty(): void {
    this.dirty = true;
  }

  async save(force = false): Promise<void> {
    if (!this.dirty && !force) return;
    this.manifest.updatedAt = this.now();
    await this.store.write(this.manifestPath, JSON.stringify(this.manifest, null, 2));
    this.dirty = false;
  }

  getConversation(conversationId: string): ConversationRecord | undefined {
    return this.manifest.conversations[conversationId];
  }

  /**
   * Register a conversation sighting and report what still has to happen.
   * Identical content that is already fully processed reports "skip".
   */
  registerSighting(
    conversationId: string,
    title: string,
    hash: string,
    messageCount: number,
    processingVersion = KNOWLEDGE_PROCESSING_VERSION
  ): { record: ConversationRecord; changed: boolean; needsArchive: boolean; needsSemantic: boolean } {
    const timestamp = this.now();
    const existing = this.manifest.conversations[conversationId];

    if (!existing) {
      const record: ConversationRecord = {
        conversationId,
        title,
        sourceHash: hash,
        lastSeenHash: hash,
        firstImportedAt: timestamp,
        lastImportedAt: timestamp,
        sourceArchived: false,
        semanticProcessed: false,
        semanticProcessingVersion: 0,
        state: "pending",
        messageCount,
      };
      this.manifest.conversations[conversationId] = record;
      this.dirty = true;
      return { record, changed: true, needsArchive: true, needsSemantic: true };
    }

    const changed = existing.lastSeenHash !== hash;
    existing.title = title || existing.title;
    existing.lastSeenHash = hash;
    existing.lastImportedAt = timestamp;
    existing.messageCount = messageCount;
    if (changed) {
      // New content means the semantic layer is stale, even though the archived
      // source and the extracted evidence from earlier runs both stay valid.
      existing.semanticProcessed = false;
      existing.state = existing.state === "failed" ? "failed" : "pending";
    }
    this.dirty = true;

    const needsArchive = changed || !existing.sourceArchived || existing.sourceHash !== hash;
    const needsSemantic =
      changed || !existing.semanticProcessed || existing.semanticProcessingVersion < processingVersion;

    return { record: existing, changed, needsArchive, needsSemantic };
  }

  markArchived(conversationId: string, path: string, hash: string): void {
    const record = this.manifest.conversations[conversationId];
    if (!record) return;
    record.sourceArchived = true;
    record.sourcePath = path;
    record.sourceHash = hash;
    if (record.state === "pending") record.state = "archived";
    this.dirty = true;
  }

  markProcessed(conversationId: string, unitIds: string[], processingVersion: number, approxPromptChars: number): void {
    const record = this.manifest.conversations[conversationId];
    if (!record) return;
    record.semanticProcessed = true;
    record.semanticProcessingVersion = processingVersion;
    record.unitIds = unitIds;
    record.state = "processed";
    record.failureReason = undefined;
    record.approxPromptChars = approxPromptChars;
    this.dirty = true;
  }

  markSkipped(conversationId: string, reason: string, processingVersion: number): void {
    const record = this.manifest.conversations[conversationId];
    if (!record) return;
    record.semanticProcessed = true;
    record.semanticProcessingVersion = processingVersion;
    record.state = "skipped";
    record.failureReason = reason;
    this.dirty = true;
  }

  markFailed(conversationId: string, reason: string): void {
    const record = this.manifest.conversations[conversationId];
    if (!record) return;
    record.state = "failed";
    record.semanticProcessed = false;
    record.failureReason = reason;
    record.failureCount = (record.failureCount || 0) + 1;
    this.dirty = true;
  }

  /** Conversation ids that still need semantic work, in stable order. */
  pendingConversationIds(processingVersion = KNOWLEDGE_PROCESSING_VERSION): string[] {
    return Object.values(this.manifest.conversations)
      .filter(
        (record) =>
          !record.semanticProcessed || record.semanticProcessingVersion < processingVersion || record.state === "failed"
      )
      .map((record) => record.conversationId);
  }

  failedConversationIds(): string[] {
    return Object.values(this.manifest.conversations)
      .filter((record) => record.state === "failed")
      .map((record) => record.conversationId);
  }

  /** Force a conversation back into the queue (used by reprocess commands). */
  resetSemanticState(conversationId: string): void {
    const record = this.manifest.conversations[conversationId];
    if (!record) return;
    record.semanticProcessed = false;
    record.semanticProcessingVersion = 0;
    record.state = record.sourceArchived ? "archived" : "pending";
    this.dirty = true;
  }

  resetAllSemanticState(): void {
    Object.values(this.manifest.conversations).forEach((record) => {
      record.semanticProcessed = false;
      record.semanticProcessingVersion = 0;
      record.state = record.sourceArchived ? "archived" : "pending";
    });
    this.dirty = true;
  }

  getConcept(key: string): ConceptRecord | undefined {
    return this.manifest.concepts[key];
  }

  listConcepts(): ConceptRecord[] {
    return Object.values(this.manifest.concepts);
  }

  putConcept(record: ConceptRecord): void {
    const existing = this.manifest.concepts[record.key];
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...record.aliases])];
      existing.lastObserved = laterOf(existing.lastObserved, record.lastObserved);
      existing.firstObserved = earlierOf(existing.firstObserved, record.firstObserved);
    } else {
      this.manifest.concepts[record.key] = record;
    }
    this.dirty = true;
  }

  /**
   * Move an interpretation along its lifecycle. Nothing is deleted: a retired
   * model keeps its evidence and its history, it simply stops being surfaced.
   */
  setConceptLifecycle(key: string, lifecycle: ModelLifecycle, reason?: string): void {
    const concept = this.manifest.concepts[key];
    if (!concept) return;
    concept.lifecycle = lifecycle;
    concept.lifecycleReason = reason;
    concept.lastReviewedAt = this.now();
    concept.surfaceInRetrieval = !isSuppressedLifecycle(lifecycle);
    this.dirty = true;
  }

  /**
   * Pick interpretations worth asking about again: the oldest, the least
   * recently reviewed, and never the ones already retired.
   */
  conceptsForReview(limit: number, staleAfterDays = 180): ConceptRecord[] {
    const cutoff = Date.now() - staleAfterDays * 86400000;
    return Object.values(this.manifest.concepts)
      .filter((concept) => !isSuppressedLifecycle(concept.lifecycle))
      .filter((concept) => {
        const reviewed = concept.lastReviewedAt ? Date.parse(concept.lastReviewedAt) : 0;
        const observed = concept.lastObserved ? Date.parse(`${concept.lastObserved}T00:00:00Z`) : 0;
        return reviewed < cutoff && (observed === 0 || observed < cutoff);
      })
      .sort((a, b) => (a.lastObserved || "").localeCompare(b.lastObserved || ""))
      .slice(0, limit);
  }

  markModelReview(): void {
    this.manifest.lastModelReviewAt = this.now();
    this.dirty = true;
  }

  /** Remember a question so the system can notice when it is asked again. */
  recordQuestion(question: string, notePath?: string): void {
    this.manifest.questionLog = [
      ...(this.manifest.questionLog || []),
      { question, askedAt: this.now(), notePath },
    ].slice(-200);
    this.dirty = true;
  }

  questionHistory(): AskedQuestionRecord[] {
    return this.manifest.questionLog || [];
  }

  addReviewEntry(entry: ReviewQueueEntry): void {
    if (this.manifest.reviewQueue.some((existing) => existing.unitId === entry.unitId)) return;
    this.manifest.reviewQueue.push(entry);
    this.dirty = true;
  }

  reviewQueue(): ReviewQueueEntry[] {
    return this.manifest.reviewQueue;
  }

  clearReviewEntriesForConversation(conversationId: string): void {
    const before = this.manifest.reviewQueue.length;
    this.manifest.reviewQueue = this.manifest.reviewQueue.filter((entry) => entry.conversationId !== conversationId);
    if (this.manifest.reviewQueue.length !== before) this.dirty = true;
  }

  recordIngestionSource(record: IngestionSourceRecord): void {
    this.manifest.ingestionSources[record.ref] = record;
    this.dirty = true;
  }

  ingestionSources(): Record<string, IngestionSourceRecord> {
    return this.manifest.ingestionSources;
  }

  startRun(runId: string, mode: string): ImportRunRecord {
    const run: ImportRunRecord = {
      runId,
      mode,
      startedAt: this.now(),
      conversationsSeen: 0,
      conversationsArchived: 0,
      conversationsProcessed: 0,
      conversationsSkipped: 0,
      conversationsFailed: 0,
      unitsWritten: 0,
      unitsQueuedForReview: 0,
      approxPromptChars: 0,
    };
    this.manifest.runs.push(run);
    this.manifest.runs = this.manifest.runs.slice(-25);
    this.manifest.lastIngestionAt = run.startedAt;
    if (mode === "reconcile" || mode === "import") this.manifest.lastReconciliationAt = run.startedAt;
    this.dirty = true;
    return run;
  }

  finishRun(run: ImportRunRecord, aborted: boolean): void {
    run.finishedAt = this.now();
    run.aborted = aborted;
    this.dirty = true;
  }

  status(processingVersion = KNOWLEDGE_PROCESSING_VERSION): KnowledgeStatus {
    const records = Object.values(this.manifest.conversations);
    return {
      totalKnown: records.length,
      archived: records.filter((record) => record.sourceArchived).length,
      processed: records.filter((record) => record.state === "processed").length,
      pending: records.filter((record) => record.state === "pending" || record.state === "archived").length,
      failed: records.filter((record) => record.state === "failed").length,
      skipped: records.filter((record) => record.state === "skipped").length,
      awaitingReview: this.manifest.reviewQueue.length,
      retiredModels: Object.values(this.manifest.concepts).filter((concept) => isSuppressedLifecycle(concept.lifecycle))
        .length,
      dueForReview: this.conceptsForReview(1000).length,
      staleProcessingVersion: records.filter(
        (record) => record.semanticProcessed && record.semanticProcessingVersion < processingVersion
      ).length,
      lastIngestionAt: this.manifest.lastIngestionAt,
      lastReconciliationAt: this.manifest.lastReconciliationAt,
      lastRun: this.manifest.runs[this.manifest.runs.length - 1],
    };
  }
}

function laterOf(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function earlierOf(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
