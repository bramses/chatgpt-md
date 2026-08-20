import { App, Plugin } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { LiveConversationPayload } from "src/Models/Knowledge/ChatGPTExport";
import { KnowledgeStatus, KNOWLEDGE_PROCESSING_VERSION } from "src/Models/Knowledge/KnowledgeImportManifest";
import { AI_SERVICE_OPENAI } from "src/Constants";
import { ApiAuthService } from "../ApiAuthService";
import { AiProviderService } from "../AiProviderService";
import { NotificationService } from "../NotificationService";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { ImportCoordinator, ImportOptions, ImportSummary } from "./ImportCoordinator";
import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeAiCaller, SemanticExtractorService } from "./SemanticExtractorService";
import { VaultRegistryService } from "./VaultRegistryService";
import { VaultRouterService } from "./VaultRouterService";
import { ObsidianVaultStore } from "./KnowledgeFileStore";
import { CompositeSourceReader, NodeSourceReader, SourceFileReader, VaultSourceReader } from "./SourceFileReader";
import { ArchiveSourceAdapter } from "./Sources/ArchiveSourceAdapter";
import { LiveCaptureAdapter } from "./Sources/LiveCaptureAdapter";
import { OfficialExportAdapter } from "./Sources/OfficialExportAdapter";
import { WatchFolderAdapter } from "./Sources/WatchFolderAdapter";
import { ConversationIngestionAdapter } from "./Sources/ConversationSource";
import { KnowledgeIndexService } from "./KnowledgeIndexService";
import { ModelReviewService, ModelReviewResult } from "./ModelReviewService";
import { ReflectionService, ChallengeResult } from "./ReflectionService";
import { ForgottenPick, SerendipityService } from "./SerendipityService";
import { VaultDefinition } from "src/Models/Knowledge/VaultDefinition";
import { getApiUrlsFromFrontmatter, getDefaultModelForService } from "src/Utilities/FrontmatterHelpers";
import { aiProviderFromKeys, aiProviderFromUrl } from "src/Utilities/ProviderHelpers";
import { Logger } from "src/Utilities/Logger";

/**
 * Facade for the knowledge importer.
 *
 * Command handlers talk only to this service. It owns lazy initialization
 * (nothing happens at plugin startup), builds the right ingestion adapters per
 * entry point, and keeps the inbox watcher alive while Obsidian is open.
 */

const MANIFEST_FILE = "knowledge-import-manifest.json";

export interface ExtractionTarget {
  model: string;
  provider: string;
}

/** Resolve which model does bulk extraction: explicit setting, else provider default. */
export function resolveExtractionTarget(settings: ChatGPT_MDSettings): ExtractionTarget {
  const configured = (settings.knowledgeExtractionModel || "").trim();
  if (configured) {
    return { model: configured, provider: aiProviderFromUrl(undefined, configured) || AI_SERVICE_OPENAI };
  }
  const provider = aiProviderFromKeys(settings as unknown as Record<string, unknown>) || AI_SERVICE_OPENAI;
  return { model: getDefaultModelForService(provider), provider };
}

export class KnowledgeImportService {
  private manifest?: ImportManifestService;
  private coordinator?: ImportCoordinator;
  private watchHandle?: number;
  private running = false;
  private abortFlag = { aborted: false };

  constructor(
    private readonly app: App,
    private readonly plugin: Plugin,
    private readonly getSettings: () => ChatGPT_MDSettings,
    private readonly aiProviderFactory: () => AiProviderService,
    private readonly apiAuthService: ApiAuthService,
    private readonly notificationService: NotificationService,
    private readonly registry: VaultRegistryService = new VaultRegistryService(app)
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  abort(): void {
    this.abortFlag.aborted = true;
  }

  /** Loads the manifest on first use, never at plugin startup. */
  private async ensureReady(): Promise<{ manifest: ImportManifestService; coordinator: ImportCoordinator }> {
    if (!this.manifest || !this.coordinator) {
      const pluginDir = this.plugin.manifest.dir || `.obsidian/plugins/${this.plugin.manifest.id}`;
      const store = new ObsidianVaultStore("plugin-data", this.app.vault.getName(), this.app.vault.adapter);
      this.manifest = new ImportManifestService(store, `${pluginDir}/${MANIFEST_FILE}`);
      await this.manifest.load();

      this.coordinator = new ImportCoordinator({
        app: this.app,
        registry: this.registry,
        manifest: this.manifest,
        extractor: new SemanticExtractorService(),
        router: new VaultRouterService(),
        normalizer: new ConversationNormalizer(),
        createCaller: (settings) => this.createCaller(settings),
        getSettings: this.getSettings,
      });
    }
    return { manifest: this.manifest, coordinator: this.coordinator };
  }

  private sourceReader(): SourceFileReader {
    return new CompositeSourceReader(new VaultSourceReader(this.app.vault.adapter), new NodeSourceReader());
  }

  /**
   * Bulk extraction goes through the plugin's normal provider stack, so any
   * configured provider works and no provider is special-cased.
   */
  private createCaller(settings: ChatGPT_MDSettings): KnowledgeAiCaller {
    const target = resolveExtractionTarget(settings);
    const apiKey = this.apiAuthService.getApiKey(settings, target.provider);
    const url = getApiUrlsFromFrontmatter(settings as unknown as Record<string, unknown>)[target.provider];

    return async (system: string, user: string): Promise<string> => {
      const ai = this.aiProviderFactory();
      const response = await ai.callAiAPI(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { model: target.model, stream: false, temperature: 0.2, maxTokens: 4000 },
        "",
        url,
        undefined,
        false,
        apiKey,
        settings
      );
      return response.fullString;
    };
  }

  private async guardedRun(
    adapters: ConversationIngestionAdapter[],
    options: ImportOptions
  ): Promise<ImportSummary | null> {
    if (this.running) {
      this.notificationService.showWarning("A ChatGPT import is already running.");
      return null;
    }
    const { coordinator } = await this.ensureReady();
    this.running = true;
    this.abortFlag = { aborted: false };
    try {
      return await coordinator.run(adapters, { ...options, signal: this.abortFlag });
    } finally {
      this.running = false;
    }
  }

  /** Historical bootstrap and later reconciliation: same command, same path. */
  async importExport(refs: string[], options: Partial<ImportOptions> = {}): Promise<ImportSummary | null> {
    const adapter = new OfficialExportAdapter(refs, this.sourceReader());
    const known = (await this.ensureReady()).manifest.status().totalKnown;
    return this.guardedRun([adapter], {
      mode: known > 0 ? "reconcile" : "import",
      refs,
      ...options,
    });
  }

  async processInbox(options: Partial<ImportOptions> = {}): Promise<ImportSummary | null> {
    const settings = this.getSettings();
    const { manifest } = await this.ensureReady();
    const adapter = new WatchFolderAdapter(
      settings.knowledgeInboxFolder,
      this.sourceReader(),
      manifest.ingestionSources()
    );
    return this.guardedRun([adapter], { mode: "inbox", ...options });
  }

  /** Continue where an interrupted run stopped, reading from the archive. */
  async resume(options: Partial<ImportOptions> = {}): Promise<ImportSummary | null> {
    const { manifest } = await this.ensureReady();
    const pending = new Set(manifest.pendingConversationIds(KNOWLEDGE_PROCESSING_VERSION));
    if (pending.size === 0) {
      this.notificationService.showSuccess("Nothing left to process. Everything is up to date.");
      return null;
    }
    return this.guardedRun([await this.archiveAdapter(pending)], {
      mode: "resume",
      conversationIds: [...pending],
      ...options,
    });
  }

  async retryFailed(): Promise<ImportSummary | null> {
    const { manifest } = await this.ensureReady();
    const failed = manifest.failedConversationIds();
    if (failed.length === 0) {
      this.notificationService.showSuccess("There are no failed conversations to retry.");
      return null;
    }
    return this.guardedRun([await this.archiveAdapter(new Set(failed))], {
      mode: "resume",
      conversationIds: failed,
      onlyFailed: true,
      force: true,
    });
  }

  /** Re-run extraction for chosen conversations without re-importing sources. */
  async reprocess(conversationIds: string[]): Promise<ImportSummary | null> {
    const { manifest } = await this.ensureReady();
    conversationIds.forEach((id) => manifest.resetSemanticState(id));
    return this.guardedRun([await this.archiveAdapter(new Set(conversationIds))], {
      mode: "reprocess",
      conversationIds,
      force: true,
    });
  }

  async reprocessAll(): Promise<ImportSummary | null> {
    const { manifest } = await this.ensureReady();
    manifest.resetAllSemanticState();
    return this.guardedRun([await this.archiveAdapter()], { mode: "reprocess", force: true });
  }

  async dryRun(refs: string[], options: Partial<ImportOptions> = {}): Promise<ImportSummary | null> {
    const adapters: ConversationIngestionAdapter[] =
      refs.length > 0 ? [new OfficialExportAdapter(refs, this.sourceReader())] : [await this.archiveAdapter()];
    return this.guardedRun(adapters, { mode: "reconcile", dryRun: true, force: true, ...options });
  }

  /** Entry point for a future companion app; runs the standard pipeline. */
  async ingestLiveConversations(payloads: LiveConversationPayload[]): Promise<ImportSummary | null> {
    return this.guardedRun([new LiveCaptureAdapter(payloads)], { mode: "inbox" });
  }

  async archiveOnly(refs: string[], options: Partial<ImportOptions> = {}): Promise<ImportSummary | null> {
    return this.guardedRun([new OfficialExportAdapter(refs, this.sourceReader())], { mode: "source-only", ...options });
  }

  async rebuildIndexes(): Promise<string[]> {
    const { manifest } = await this.ensureReady();
    const settings = this.getSettings();
    const vaults = await this.registry.resolveVaults(settings.knowledgeVaultRegistry);
    const personal =
      vaults.find((vault) => vault.id === settings.knowledgePersonalVault.trim().toLowerCase()) ||
      vaults.find((vault) => vault.name.toLowerCase() === settings.knowledgePersonalVault.trim().toLowerCase()) ||
      vaults.find((vault) => vault.kind === "personal") ||
      vaults.find((vault) => vault.isCurrent);
    if (!personal) return [];

    const store = this.registry.storeFor(personal);
    if (!store) return [];
    const profile = await this.registry.buildProfile(personal, store);
    return new KnowledgeIndexService(manifest).rebuild(store, profile.folders);
  }

  /**
   * The vault that represents the person. The reflective commands only ever
   * operate here: challenging a story about yourself has no meaning in a
   * project vault.
   */
  private async personalVault(): Promise<{
    vault: VaultDefinition;
    store: ObsidianVaultStore | NonNullable<ReturnType<VaultRegistryService["storeFor"]>>;
  }> {
    const settings = this.getSettings();
    const vaults = await this.registry.resolveVaults(settings.knowledgeVaultRegistry);
    const selector = settings.knowledgePersonalVault.trim().toLowerCase();
    const vault =
      vaults.find((candidate) => candidate.id === selector) ||
      vaults.find((candidate) => candidate.name.toLowerCase() === selector) ||
      vaults.find((candidate) => candidate.kind === "personal") ||
      vaults.find((candidate) => candidate.isCurrent);
    if (!vault) throw new Error("No personal vault is available.");
    const store = this.registry.storeFor(vault);
    if (!store) throw new Error(`Personal vault "${vault.name}" is not reachable from here.`);
    return { vault, store };
  }

  /** Look for what complicates a story, not for what confirms it. */
  async challengeStory(hypothesis: string): Promise<ChallengeResult> {
    const { manifest } = await this.ensureReady();
    const { store } = await this.personalVault();
    const reflection = new ReflectionService(manifest);
    const result = await reflection.challengeStory(store, hypothesis, this.createCaller(this.getSettings()));
    await manifest.save();
    return result;
  }

  /** Possibilities the archive does not predict. */
  async openHorizon(): Promise<string> {
    const { manifest } = await this.ensureReady();
    const { store } = await this.personalVault();
    const path = await new ReflectionService(manifest).openHorizon(store, this.createCaller(this.getSettings()));
    await manifest.save();
    return path;
  }

  /** Close a reflection instead of extending it. */
  async enoughAnalysis(topic: string): Promise<string> {
    const { manifest } = await this.ensureReady();
    const text = await new ReflectionService(manifest).enoughAnalysis(topic, this.createCaller(this.getSettings()));
    await manifest.save();
    return text;
  }

  /** Human-readable explanation of a detected question loop. */
  describeLoop(verdict: Parameters<ReflectionService["describeLoop"]>[0]): string {
    return new ReflectionService(this.manifest!).describeLoop(verdict);
  }

  /** Ask whether old interpretations still fit; let the person retire them. */
  async reviewPersonalModels(): Promise<ModelReviewResult> {
    const { manifest } = await this.ensureReady();
    const { store } = await this.personalVault();
    const result = await new ModelReviewService(manifest).writeReviewNote(store);
    await manifest.save();
    return result;
  }

  async somethingForgotten(count = 3): Promise<ForgottenPick[]> {
    const { manifest } = await this.ensureReady();
    const { vault } = await this.personalVault();
    return new SerendipityService(manifest).forgotten(vault.id, count);
  }

  async strangeConnection(): Promise<string | null> {
    const { manifest } = await this.ensureReady();
    const { store } = await this.personalVault();
    const path = await new SerendipityService(manifest).writeStrangeConnection(store);
    await manifest.save();
    return path;
  }

  /** Human-set `status:` values in notes flow back into the registry. */
  async syncModelLifecycles(): Promise<number> {
    const { manifest } = await this.ensureReady();
    const { store } = await this.personalVault();
    const synced = await new ModelReviewService(manifest).syncLifecycleFromNotes(store);
    await manifest.save();
    return synced;
  }

  async status(): Promise<KnowledgeStatus> {
    const { manifest } = await this.ensureReady();
    return manifest.status(KNOWLEDGE_PROCESSING_VERSION);
  }

  /** Known conversations, newest first, for the reprocess picker. */
  async listConversations(): Promise<Array<{ conversationId: string; title: string; state: string }>> {
    const { manifest } = await this.ensureReady();
    return Object.values(manifest.get().conversations)
      .sort((a, b) => (b.lastImportedAt || "").localeCompare(a.lastImportedAt || ""))
      .map((record) => ({ conversationId: record.conversationId, title: record.title, state: record.state }));
  }

  async reviewQueuePath(): Promise<string> {
    return "99 System/Review Queue.md";
  }

  /** Preview routing for every configured vault without writing anything. */
  async describeVaults(): Promise<string[]> {
    const settings = this.getSettings();
    const vaults = await this.registry.resolveVaults(settings.knowledgeVaultRegistry);
    return vaults.map(
      (vault) =>
        `${vault.name} [${vault.kind}]${vault.isCurrent ? " (open now)" : ""} - ${vault.path || "path unknown"}${
          vault.description ? ` - ${vault.description}` : ""
        }`
    );
  }

  private async archiveAdapter(conversationIds?: Set<string>): Promise<ConversationIngestionAdapter> {
    const settings = this.getSettings();
    const vaults = await this.registry.resolveVaults(settings.knowledgeVaultRegistry);
    const archive =
      vaults.find((vault) => vault.id === settings.knowledgeArchiveVault.trim().toLowerCase()) ||
      vaults.find((vault) => vault.name.toLowerCase() === settings.knowledgeArchiveVault.trim().toLowerCase()) ||
      vaults.find((vault) => vault.isCurrent);
    if (!archive) throw new Error("No archive vault is available.");
    const store = this.registry.storeFor(archive);
    if (!store) throw new Error(`Archive vault "${archive.name}" is not reachable from here.`);
    return new ArchiveSourceAdapter(store, settings.knowledgeArchiveFolder, conversationIds);
  }

  startWatching(): void {
    const settings = this.getSettings();
    if (this.watchHandle !== undefined) return;
    const seconds = Math.max(30, settings.knowledgeWatchIntervalSeconds || 300);

    this.watchHandle = window.setInterval(() => {
      if (this.running) return;
      this.processInbox()
        .then((summary) => {
          if (summary && summary.run.conversationsSeen > 0) {
            this.notificationService.showSuccess(
              `ChatGPT inbox: ${summary.run.conversationsProcessed} processed, ${summary.run.unitsWritten} knowledge units written.`
            );
          }
        })
        .catch((error) => Logger.error("[ChatGPT MD] Inbox watch failed", { error }));
    }, seconds * 1000);

    this.plugin.registerInterval(this.watchHandle);
    Logger.debug("[ChatGPT MD] Watching ChatGPT inbox", { folder: settings.knowledgeInboxFolder, seconds });
  }

  stopWatching(): void {
    if (this.watchHandle === undefined) return;
    window.clearInterval(this.watchHandle);
    this.watchHandle = undefined;
  }

  isWatching(): boolean {
    return this.watchHandle !== undefined;
  }
}
