import { App } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { NormalizedConversation } from "src/Models/Knowledge/ChatGPTExport";
import { SemanticUnit } from "src/Models/Knowledge/SemanticUnit";
import { VaultDefinition, VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { ImportRunRecord, KNOWLEDGE_PROCESSING_VERSION } from "src/Models/Knowledge/KnowledgeImportManifest";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { ImportManifestService } from "./ImportManifestService";
import { DryRunVaultStore, KnowledgeFileStore, MemoryVaultStore } from "./KnowledgeFileStore";
import { KnowledgeIndexService } from "./KnowledgeIndexService";
import { KnowledgeWriterService, ConversationRef } from "./KnowledgeWriterService";
import { SemanticExtractorService, KnowledgeAiCaller } from "./SemanticExtractorService";
import { SemanticNoteResolver } from "./SemanticNoteResolver";
import { VaultRegistryService } from "./VaultRegistryService";
import { PluginIntegrationService } from "./PluginIntegrationService";
import { CapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { RoutingDecision, VaultRouterService } from "./VaultRouterService";
import { ConversationBatch, ConversationIngestionAdapter } from "./Sources/ConversationSource";
import { AbortedError, runWithConcurrency, withRetry } from "src/Utilities/Concurrency";
import { shortHash } from "src/Utilities/KnowledgeHashing";
import { isoDate, truncate } from "src/Utilities/KnowledgeText";
import { Logger } from "src/Utilities/Logger";

/**
 * The pipeline.
 *
 *   ingestion adapter -> normalized conversation -> change detection
 *     -> immutable source archive -> semantic extraction -> vault routing
 *     -> note resolution -> merge into durable notes -> provenance -> indexes
 *
 * The coordinator owns the parts that must not be duplicated per entry point:
 * resumability, idempotency, bounded concurrency, retry, abort, accounting.
 * A historical import, an inbox pickup and a reconciliation run all take this
 * same path - there is no second, weaker pipeline for new conversations.
 */

export type ImportMode = "import" | "reconcile" | "inbox" | "resume" | "reprocess" | "source-only";

export interface ImportOptions {
  mode: ImportMode;
  /** Export/inbox files for the export-based modes. */
  refs?: string[];
  /** Restrict processing to these conversations (reprocess). */
  conversationIds?: string[];
  /** Only retry conversations that previously failed. */
  onlyFailed?: boolean;
  /** Re-run semantic processing even for already-processed conversations. */
  force?: boolean;
  /** Plan everything, write nothing. */
  dryRun?: boolean;
  signal?: { aborted: boolean };
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportProgress {
  phase: "preparing" | "ingesting" | "archiving" | "analyzing" | "indexing" | "done";
  processed: number;
  total: number;
  currentTitle?: string;
  unitsWritten: number;
  queuedForReview: number;
  failed: number;
  skipped: number;
}

export interface ImportSummary {
  run: ImportRunRecord;
  warnings: string[];
  plannedWrites?: Map<string, string[]>;
  aborted: boolean;
  routingPreview: Array<{
    conversation: string;
    unit: string;
    kind: string;
    vault: string;
    folder: string;
    confidence: number;
    status: string;
  }>;
}

interface RunContext {
  settings: ChatGPT_MDSettings;
  manifest: ImportManifestService;
  resolver: SemanticNoteResolver;
  writer: KnowledgeWriterService;
  index: KnowledgeIndexService;
  stores: Map<string, KnowledgeFileStore>;
  folders: Map<string, string[]>;
  /** Destination-vault capabilities, resolved once per run and cached. */
  vaultCapabilities: Map<string, CapabilityFlags>;
  profiles: VaultProfile[];
  archiveVaultId: string;
  archiveVaultName: string;
  personalVaultId?: string;
  archiveStore: KnowledgeFileStore;
  personalStore?: KnowledgeFileStore;
  run: ImportRunRecord;
  warnings: string[];
  routingPreview: ImportSummary["routingPreview"];
  processingVersion: number;
  dryRun: boolean;
}

export interface CoordinatorDependencies {
  app: App;
  registry: VaultRegistryService;
  manifest: ImportManifestService;
  extractor: SemanticExtractorService;
  router: VaultRouterService;
  normalizer: ConversationNormalizer;
  /** Builds the provider-backed caller. Injected so tests never touch the AI SDK. */
  createCaller: (settings: ChatGPT_MDSettings) => KnowledgeAiCaller;
  getSettings: () => ChatGPT_MDSettings;
  /** Optional: when absent, every vault is treated as plain Markdown. */
  integrations?: PluginIntegrationService;
  manifestPathForDryRun?: string;
}

/** A conversation needs analysis when it is new, changed, stale or failed. */
function needsSemanticWork(
  record: { semanticProcessed: boolean; semanticProcessingVersion: number; state: string } | undefined,
  processingVersion: number,
  force?: boolean
): boolean {
  if (force) return true;
  if (!record) return true;
  return !record.semanticProcessed || record.semanticProcessingVersion < processingVersion || record.state === "failed";
}

function writeContext(context: RunContext) {
  return {
    archiveVaultId: context.archiveVaultId,
    archiveVaultName: context.archiveVaultName,
    personalVaultId: context.personalVaultId,
    processingVersion: context.processingVersion,
    importedAt: context.run.startedAt,
  };
}

function extractionOptions(context: RunContext) {
  return {
    profiles: context.profiles,
    maxCharsPerChunk: context.settings.knowledgeMaxCharsPerChunk,
    minUserChars: context.settings.knowledgeMinConversationChars,
    enableDreams: context.settings.knowledgeEnableDreams,
    enablePeople: context.settings.knowledgeEnablePeople,
    enableMedia: context.settings.knowledgeEnableMedia,
  };
}

const SAVE_EVERY = 10;
/** Archiving is local file work only, so it can run wider than model calls. */
const ARCHIVE_CONCURRENCY = 8;

export class ImportCoordinator {
  constructor(private readonly deps: CoordinatorDependencies) {}

  async run(adapters: ConversationIngestionAdapter[], options: ImportOptions): Promise<ImportSummary> {
    const context = await this.prepare(options);
    const progress: ImportProgress = {
      phase: "ingesting",
      processed: 0,
      total: 0,
      unitsWritten: 0,
      queuedForReview: 0,
      failed: 0,
      skipped: 0,
    };
    let aborted = false;

    try {
      const batches = await this.collect(adapters, context);
      const conversations = this.selectConversations(batches, context, options);
      progress.total = conversations.length;
      context.run.conversationsSeen = conversations.length;
      options.onProgress?.({ ...progress });

      // Layer A first, for every conversation, before a single model call: an
      // interrupted run must never leave a conversation unpreserved.
      await this.archiveAll(conversations, context, options, progress);

      if (options.mode !== "source-only") {
        await this.analyzeAll(conversations, context, options, progress);
      }

      aborted = Boolean(options.signal?.aborted);
      if (!aborted) {
        progress.phase = "indexing";
        options.onProgress?.({ ...progress });
        await this.finalize(context, batches);
      }
    } catch (error) {
      if (!(error instanceof AbortedError)) throw error;
      aborted = true;
    } finally {
      context.manifest.finishRun(context.run, aborted);
      if (!context.dryRun) await context.manifest.save(true);
    }

    progress.phase = "done";
    options.onProgress?.({ ...progress });

    return {
      run: context.run,
      warnings: context.warnings,
      aborted,
      routingPreview: context.routingPreview,
      plannedWrites: context.dryRun ? this.collectPlannedWrites(context) : undefined,
    };
  }

  /** Phase A: preserve every source conversation. No model calls happen here. */
  private async archiveAll(
    conversations: NormalizedConversation[],
    context: RunContext,
    options: ImportOptions,
    progress: ImportProgress
  ): Promise<void> {
    progress.phase = "archiving";
    progress.processed = 0;
    options.onProgress?.({ ...progress });

    await runWithConcurrency(
      conversations,
      ARCHIVE_CONCURRENCY,
      async (conversation, index) => {
        if (options.signal?.aborted) throw new AbortedError();
        try {
          await this.archiveConversation(conversation, context);
        } catch (error) {
          if (error instanceof AbortedError) throw error;
          this.recordFailure(conversation, context, progress, error);
        }
        progress.processed++;
        if (!context.dryRun && index % SAVE_EVERY === SAVE_EVERY - 1) await context.manifest.save();
        options.onProgress?.({ ...progress });
      },
      options.signal
    );

    if (!context.dryRun) await context.manifest.save();
  }

  /** Phase B: extract, route and write. Bounded, resumable, per conversation. */
  private async analyzeAll(
    conversations: NormalizedConversation[],
    context: RunContext,
    options: ImportOptions,
    progress: ImportProgress
  ): Promise<void> {
    const caller = this.deps.createCaller(context.settings);
    progress.phase = "analyzing";
    progress.processed = 0;
    options.onProgress?.({ ...progress });

    await runWithConcurrency(
      conversations,
      context.settings.knowledgeBatchSize,
      async (conversation, index) => {
        if (options.signal?.aborted) throw new AbortedError();
        progress.currentTitle = conversation.title;
        try {
          await this.analyzeConversation(conversation, context, options, caller, progress);
        } catch (error) {
          if (error instanceof AbortedError) throw error;
          this.recordFailure(conversation, context, progress, error);
        }
        progress.processed++;
        options.onProgress?.({ ...progress });
        if (!context.dryRun && index % SAVE_EVERY === SAVE_EVERY - 1) await context.manifest.save();
      },
      options.signal
    );
  }

  private recordFailure(
    conversation: NormalizedConversation,
    context: RunContext,
    progress: ImportProgress,
    error: unknown
  ): void {
    const reason = error instanceof Error ? error.message : String(error);
    context.manifest.markFailed(conversation.conversationId, reason);
    context.run.conversationsFailed++;
    progress.failed++;
    context.warnings.push(`${conversation.title}: ${reason}`);
    Logger.error("[ChatGPT MD] Conversation processing failed", {
      conversationId: conversation.conversationId,
      reason,
    });
  }

  /** Resolve vaults, stores and profiles once per run. */
  private async prepare(options: ImportOptions): Promise<RunContext> {
    const settings = this.deps.getSettings();
    options.onProgress?.({
      phase: "preparing",
      processed: 0,
      total: 0,
      unitsWritten: 0,
      queuedForReview: 0,
      failed: 0,
      skipped: 0,
    });

    const vaults = (await this.deps.registry.resolveVaults(settings.knowledgeVaultRegistry)).filter(
      (vault) => vault.enabled
    );
    const { stores, folders, profiles, warnings, vaultCapabilities } = await this.openVaults(
      vaults,
      Boolean(options.dryRun)
    );

    const archiveVault = pickVault(vaults, settings.knowledgeArchiveVault) || pickCurrent(vaults);
    const personalVault =
      pickVault(vaults, settings.knowledgePersonalVault) || vaults.find((vault) => vault.kind === "personal");
    const archiveStore = stores.get(archiveVault.id);
    if (!archiveStore) throw new Error(`The source archive vault "${archiveVault.name}" is not writable from here.`);

    const manifest = options.dryRun ? await this.cloneManifest() : this.deps.manifest;
    const resolver = new SemanticNoteResolver(manifest);
    const processingVersion = KNOWLEDGE_PROCESSING_VERSION;

    return {
      settings,
      manifest,
      resolver,
      writer: new KnowledgeWriterService(resolver, manifest),
      index: new KnowledgeIndexService(manifest),
      stores,
      folders,
      vaultCapabilities,
      profiles,
      archiveVaultId: archiveVault.id,
      archiveVaultName: archiveVault.name,
      personalVaultId: personalVault?.id,
      archiveStore,
      personalStore: personalVault ? stores.get(personalVault.id) : undefined,
      run: manifest.startRun(shortHash(`${Date.now()}-${options.mode}`), options.mode),
      warnings,
      routingPreview: [],
      processingVersion,
      dryRun: Boolean(options.dryRun),
    };
  }

  /**
   * Open every reachable vault and profile it once. A vault that cannot be
   * reached from this device is reported, never silently dropped.
   */
  private async openVaults(
    vaults: VaultDefinition[],
    dryRun: boolean
  ): Promise<{
    stores: Map<string, KnowledgeFileStore>;
    folders: Map<string, string[]>;
    profiles: VaultProfile[];
    warnings: string[];
    vaultCapabilities: Map<string, CapabilityFlags>;
  }> {
    const stores = new Map<string, KnowledgeFileStore>();
    const folders = new Map<string, string[]>();
    const vaultCapabilities = new Map<string, CapabilityFlags>();
    const profiles: VaultProfile[] = [];
    const warnings: string[] = [];

    for (const vault of vaults) {
      const base = this.deps.registry.storeFor(vault);
      if (!base) {
        warnings.push(`Vault "${vault.name}" is not reachable from here and was skipped.`);
        continue;
      }
      const store = dryRun ? new DryRunVaultStore(base) : base;
      stores.set(vault.id, store);
      const profile = await this.deps.registry.buildProfile(vault, store);
      profiles.push(profile);
      folders.set(vault.id, profile.folders);

      // Plugins are vault-local, so every destination gets its own capability
      // profile. Cached, so writing a note never rescans .obsidian.
      if (this.deps.integrations) {
        const capabilityProfile = await this.deps.integrations.getProfile(vault, base);
        vaultCapabilities.set(vault.id, capabilityProfile.capabilities);
        capabilityProfile.warnings.forEach((warning) => warnings.push(warning));
      }
    }

    return { stores, folders, profiles, warnings, vaultCapabilities };
  }

  /** Dry runs work on an isolated copy so nothing about real state changes. */
  private async cloneManifest(): Promise<ImportManifestService> {
    const snapshot = JSON.stringify(this.deps.manifest.get());
    const memory = new MemoryVaultStore("dry-run", "dry-run", { "manifest.json": snapshot });
    const clone = new ImportManifestService(memory, "manifest.json");
    await clone.load();
    return clone;
  }

  private async collect(adapters: ConversationIngestionAdapter[], context: RunContext): Promise<ConversationBatch[]> {
    const batches: ConversationBatch[] = [];
    for (const adapter of adapters) {
      const loaded = await adapter.load();
      loaded.forEach((batch) => {
        batch.warnings.forEach((warning) => context.warnings.push(warning.reason));
        batches.push(batch);
      });
    }
    return batches;
  }

  /**
   * Change detection. Conversation ids plus content hashes decide what runs;
   * identical content that is already processed is skipped without a model call.
   */
  private selectConversations(
    batches: ConversationBatch[],
    context: RunContext,
    options: ImportOptions
  ): NormalizedConversation[] {
    const restrictTo = options.conversationIds ? new Set(options.conversationIds) : undefined;
    const failedOnly = options.onlyFailed ? new Set(context.manifest.failedConversationIds()) : undefined;
    const selected = new Map<string, NormalizedConversation>();

    batches.forEach((batch) => {
      batch.conversations.forEach((conversation) => {
        if (restrictTo && !restrictTo.has(conversation.conversationId)) return;
        if (failedOnly && !failedOnly.has(conversation.conversationId)) return;

        const hash = this.deps.normalizer.contentHash(conversation);
        const sighting = context.manifest.registerSighting(
          conversation.conversationId,
          conversation.title,
          hash,
          conversation.messages.length,
          context.processingVersion
        );

        const needsWork = options.force || sighting.needsArchive || sighting.needsSemantic;
        if (!needsWork) {
          context.run.conversationsSkipped++;
          return;
        }
        // A later export wins over an earlier inbox copy of the same conversation.
        selected.set(conversation.conversationId, conversation);
      });
    });

    return [...selected.values()];
  }

  private async archiveConversation(conversation: NormalizedConversation, context: RunContext): Promise<string> {
    const record = context.manifest.getConversation(conversation.conversationId);
    const hash = this.deps.normalizer.contentHash(conversation);

    const document = this.deps.normalizer.build(conversation, {
      archiveFolder: context.settings.knowledgeArchiveFolder,
      importedAt: context.run.startedAt,
      processingVersion: context.processingVersion,
      processed: record?.semanticProcessed === true,
    });
    const changed = await context.writer.writeSource(context.archiveStore, document);
    if (changed) context.run.conversationsArchived++;
    context.manifest.markArchived(conversation.conversationId, document.path, hash);
    return document.path;
  }

  private async analyzeConversation(
    conversation: NormalizedConversation,
    context: RunContext,
    options: ImportOptions,
    caller: KnowledgeAiCaller,
    progress: ImportProgress
  ): Promise<void> {
    const record = context.manifest.getConversation(conversation.conversationId);
    const sourcePath =
      record?.sourcePath || this.deps.normalizer.archivePath(conversation, context.settings.knowledgeArchiveFolder);

    if (!needsSemanticWork(record, context.processingVersion, options.force)) {
      this.countSkip(context, progress);
      return;
    }

    const extraction = await this.deps.extractor.extract(
      conversation,
      this.wrapCaller(caller, options),
      extractionOptions(context)
    );

    context.run.approxPromptChars += extraction.approxPromptChars;

    if (extraction.skipped || extraction.analysis.units.length === 0) {
      context.manifest.markSkipped(
        conversation.conversationId,
        extraction.skipReason || "no durable knowledge found",
        context.processingVersion
      );
      this.countSkip(context, progress);
      return;
    }

    // Re-running a conversation replaces its review entries instead of stacking them.
    context.manifest.clearReviewEntriesForConversation(conversation.conversationId);

    const reference: ConversationRef = {
      conversationId: conversation.conversationId,
      title: conversation.title,
      date: isoDate(conversation.createdAt),
      sourcePath,
    };

    await this.writeUnits(extraction.analysis.units, reference, context, progress);

    context.manifest.markProcessed(
      conversation.conversationId,
      extraction.analysis.units.map((unit) => unit.id),
      context.processingVersion,
      extraction.approxPromptChars
    );
    context.run.conversationsProcessed++;

    if (!context.dryRun) {
      await context.writer.markSourceProcessed(context.archiveStore, sourcePath, context.processingVersion);
    }
  }

  private countSkip(context: RunContext, progress: ImportProgress): void {
    context.run.conversationsSkipped++;
    progress.skipped++;
  }

  /** Write the semantic units of one conversation and record the outcome. */
  private async writeUnits(
    units: SemanticUnit[],
    reference: ConversationRef,
    context: RunContext,
    progress: ImportProgress
  ): Promise<void> {
    for (const unit of units) {
      await this.routeAndWrite(unit, reference, context, progress);
    }
  }

  private wrapCaller(caller: KnowledgeAiCaller, options: ImportOptions): KnowledgeAiCaller {
    return (system, user) => withRetry(() => caller(system, user), { attempts: 3, signal: options.signal });
  }

  private async routeAndWrite(
    unit: SemanticUnit,
    reference: ConversationRef,
    context: RunContext,
    progress: ImportProgress
  ): Promise<void> {
    const decision = this.deps.router.route(unit, {
      profiles: context.profiles,
      personalVaultId: context.personalVaultId,
      autoThreshold: context.settings.knowledgeAutoRouteConfidence,
      reviewThreshold: context.settings.knowledgeReviewConfidence,
    });

    this.recordPreview(unit, reference, decision, context);

    const targetStore = decision.vaultId ? context.stores.get(decision.vaultId) : undefined;

    if (!targetStore || decision.status === "uncategorized") {
      await this.holdForReview(unit, reference, decision, context, "uncategorized");
      progress.queuedForReview++;
      context.run.unitsQueuedForReview++;
      return;
    }

    const written = await context.writer.writeUnit(
      {
        unit,
        decision,
        conversation: reference,
        store: targetStore,
        existingFolders: context.folders.get(decision.vaultId!) || [],
        capabilities: context.vaultCapabilities.get(decision.vaultId!),
      },
      writeContext(context)
    );

    progress.unitsWritten++;
    context.run.unitsWritten++;

    // A reading the person retired is not brought back to life by new
    // evidence. The evidence is kept; the decision to resurface stays theirs.
    if (written.wasRetired) {
      this.flagForReview(
        unit,
        reference,
        { ...decision, reason: "new evidence for a retired reading" },
        context,
        progress
      );
      return;
    }

    if (decision.status === "auto-review") {
      this.flagForReview(unit, reference, decision, context, progress);
    }
  }

  /** Every routing decision is visible, including the ones that wrote nothing. */
  private recordPreview(
    unit: SemanticUnit,
    reference: ConversationRef,
    decision: RoutingDecision,
    context: RunContext
  ): void {
    context.routingPreview.push({
      conversation: reference.title,
      unit: truncate(unit.title, 60),
      kind: unit.kind,
      vault: decision.vaultName || "(none)",
      folder: decision.folder || "(none)",
      confidence: decision.confidence,
      status: decision.status,
    });
  }

  private flagForReview(
    unit: SemanticUnit,
    reference: ConversationRef,
    decision: RoutingDecision,
    context: RunContext,
    progress: ImportProgress
  ): void {
    this.queueReview(unit, reference, decision, context, "routed-low-confidence");
    progress.queuedForReview++;
    context.run.unitsQueuedForReview++;
  }

  /** Nothing is discarded: unroutable meaning is preserved and flagged. */
  private async holdForReview(
    unit: SemanticUnit,
    reference: ConversationRef,
    decision: RoutingDecision,
    context: RunContext,
    status: "uncategorized" | "routed-low-confidence"
  ): Promise<void> {
    const store = context.personalStore || context.archiveStore;
    await context.writer.writeUncategorized(unit, reference, store, writeContext(context), decision.reason);
    this.queueReview(unit, reference, decision, context, status);
  }

  private queueReview(
    unit: SemanticUnit,
    reference: ConversationRef,
    decision: RoutingDecision,
    context: RunContext,
    status: "uncategorized" | "routed-low-confidence"
  ): void {
    context.manifest.addReviewEntry({
      unitId: unit.id,
      conversationId: reference.conversationId,
      conversationTitle: reference.title,
      kind: unit.kind,
      title: unit.title,
      excerpt: truncate(unit.content, 200),
      chosenVaultId: decision.vaultId,
      chosenPath: decision.folder,
      confidence: decision.confidence,
      reason: decision.reason,
      status,
      createdAt: context.run.startedAt,
    });
  }

  private async finalize(context: RunContext, batches: ConversationBatch[]): Promise<void> {
    batches.forEach((batch) => {
      context.manifest.recordIngestionSource({
        ref: batch.ref,
        size: batch.size,
        mtime: batch.mtime,
        lastProcessedAt: context.run.startedAt,
      });
    });

    const indexStore = context.personalStore || context.archiveStore;
    const folders = context.folders.get(indexStore.vaultId) || [];
    await context.index.rebuild(indexStore, folders);
    await context.index.writeImportLog(indexStore, context.run, context.warnings.slice(0, 50));
  }

  private collectPlannedWrites(context: RunContext): Map<string, string[]> {
    const planned = new Map<string, string[]>();
    context.stores.forEach((store, vaultId) => {
      if (store instanceof DryRunVaultStore) planned.set(vaultId, [...store.plannedWrites.keys()]);
    });
    return planned;
  }
}

function pickVault(vaults: VaultDefinition[], selector: string): VaultDefinition | undefined {
  if (!selector || !selector.trim()) return undefined;
  const needle = selector.trim().toLowerCase();
  return vaults.find((vault) => vault.id === needle || vault.name.toLowerCase() === needle);
}

function pickCurrent(vaults: VaultDefinition[]): VaultDefinition {
  const current = vaults.find((vault) => vault.isCurrent);
  if (!current) throw new Error("No writable vault is available for the source archive.");
  return current;
}
