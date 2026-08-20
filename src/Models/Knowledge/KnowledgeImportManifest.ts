/**
 * Durable, resumable state for the knowledge importer.
 *
 * The manifest - not filenames - is the source of truth. Conversation ids plus
 * content hashes decide whether work is new, changed, or already done.
 */

import { KnowledgeLayer, ModelLifecycle } from "./Epistemics";

/** Bump when extraction/routing/writing changes in a way that justifies a re-run. */
export const KNOWLEDGE_PROCESSING_VERSION = 1;
export const KNOWLEDGE_MANIFEST_VERSION = 1;

export type ConversationState = "pending" | "archived" | "processed" | "failed" | "skipped";

export interface ConversationRecord {
  conversationId: string;
  title: string;
  /** Hash of the normalized conversation content. */
  sourceHash: string;
  /** Hash last seen from any ingestion source. */
  lastSeenHash: string;
  firstImportedAt: string;
  lastImportedAt: string;
  sourceArchived: boolean;
  sourcePath?: string;
  semanticProcessed: boolean;
  semanticProcessingVersion: number;
  state: ConversationState;
  unitIds?: string[];
  failureReason?: string;
  failureCount?: number;
  messageCount?: number;
  /** Approximate characters sent to the model, for cost awareness. */
  approxPromptChars?: number;
}

export interface ConceptRecord {
  /** Normalized key used for lookup. */
  key: string;
  title: string;
  vaultId: string;
  path: string;
  aliases: string[];
  kind: string;
  firstObserved?: string;
  lastObserved?: string;
  /** Which epistemic layer this note belongs to. */
  layer?: KnowledgeLayer;
  /**
   * Where this interpretation is in its life. Models must be able to become
   * historical, be contradicted, and be retired - otherwise the vault turns
   * into a system that can never invalidate its own theories.
   */
  lifecycle?: ModelLifecycle;
  lifecycleReason?: string;
  lastReviewedAt?: string;
  /** False keeps a note out of retrieval and indexes without deleting it. */
  surfaceInRetrieval?: boolean;
}

/** A question the person asked the archive, used to notice loops. */
export interface AskedQuestionRecord {
  question: string;
  askedAt: string;
  /** Where the answer was written, when one was written. */
  notePath?: string;
}

export interface ReviewQueueEntry {
  unitId: string;
  conversationId: string;
  conversationTitle: string;
  kind: string;
  title: string;
  excerpt: string;
  chosenVaultId?: string;
  chosenPath?: string;
  confidence: number;
  reason: string;
  status: "routed-low-confidence" | "uncategorized";
  createdAt: string;
}

export interface IngestionSourceRecord {
  /** File path or logical source id. */
  ref: string;
  size?: number;
  mtime?: number;
  hash?: string;
  lastProcessedAt: string;
}

export interface ImportRunRecord {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  mode: string;
  conversationsSeen: number;
  conversationsArchived: number;
  conversationsProcessed: number;
  conversationsSkipped: number;
  conversationsFailed: number;
  unitsWritten: number;
  unitsQueuedForReview: number;
  approxPromptChars: number;
  aborted?: boolean;
}

export interface KnowledgeImportManifest {
  version: number;
  processingVersion: number;
  createdAt: string;
  updatedAt: string;
  lastIngestionAt?: string;
  lastReconciliationAt?: string;
  conversations: Record<string, ConversationRecord>;
  concepts: Record<string, ConceptRecord>;
  reviewQueue: ReviewQueueEntry[];
  ingestionSources: Record<string, IngestionSourceRecord>;
  runs: ImportRunRecord[];
  /** Questions asked of the archive, so repetition can be recognized. */
  questionLog: AskedQuestionRecord[];
  /** When personal models were last reviewed for whether they still fit. */
  lastModelReviewAt?: string;
}

export function createEmptyManifest(now: string): KnowledgeImportManifest {
  return {
    version: KNOWLEDGE_MANIFEST_VERSION,
    processingVersion: KNOWLEDGE_PROCESSING_VERSION,
    createdAt: now,
    updatedAt: now,
    conversations: {},
    concepts: {},
    reviewQueue: [],
    ingestionSources: {},
    runs: [],
    questionLog: [],
  };
}

export interface KnowledgeStatus {
  totalKnown: number;
  archived: number;
  processed: number;
  pending: number;
  failed: number;
  skipped: number;
  awaitingReview: number;
  /** Interpretations no longer surfaced in retrieval. */
  retiredModels: number;
  /** Interpretations whose review date has passed. */
  dueForReview: number;
  staleProcessingVersion: number;
  lastIngestionAt?: string;
  lastReconciliationAt?: string;
  lastRun?: ImportRunRecord;
}
