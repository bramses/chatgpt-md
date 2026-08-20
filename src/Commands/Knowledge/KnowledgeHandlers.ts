import { Notice, SuggestModal } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { CallbackCommandHandler, CommandMetadata } from "../CommandHandler";
import { KnowledgeImportModal } from "src/Views/KnowledgeImportModal";
import { KnowledgeStatusModal } from "src/Views/KnowledgeStatusModal";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";
import { ImportSummary } from "src/Services/Knowledge/ImportCoordinator";
import { Logger } from "src/Utilities/Logger";
import { PLUGIN_PREFIX } from "src/Constants";

/**
 * Command handlers for the knowledge importer.
 *
 * Handlers stay thin: they collect input, call one service method, and report
 * the outcome. All behavior lives in `KnowledgeImportService` and below.
 */

function requireService(services: ServiceContainer): KnowledgeImportService {
  const service = services.knowledgeImportService;
  if (!service) throw new Error("Knowledge importer is not available.");
  return service;
}

async function report(action: string, work: Promise<ImportSummary | null>): Promise<void> {
  try {
    const summary = await work;
    if (!summary) return;
    const run = summary.run;
    new Notice(
      `${PLUGIN_PREFIX} ${action}: ${run.conversationsProcessed} processed, ${run.unitsWritten} units, ` +
        `${run.conversationsSkipped} skipped, ${run.unitsQueuedForReview} for review, ${run.conversationsFailed} failed` +
        (summary.aborted ? " (stopped, resumable)" : ""),
      9000
    );
  } catch (error) {
    Logger.error(`[ChatGPT MD] ${action} failed`, { error });
    new Notice(`${PLUGIN_PREFIX} ${action} failed: ${error instanceof Error ? error.message : String(error)}`, 9000);
  }
}

export class ImportChatGPTHistoryHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    new KnowledgeImportModal(this.services.app, requireService(this.services)).open();
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-import-history", name: "Import complete ChatGPT history", icon: "database" };
  }
}

export class ResumeKnowledgeImportHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    await report("Resume", requireService(this.services).resume());
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-resume-import", name: "Resume ChatGPT import", icon: "play" };
  }
}

export class ProcessChatGPTInboxHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    await report("Inbox", requireService(this.services).processInbox());
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-process-inbox", name: "Process ChatGPT inbox now", icon: "inbox" };
  }
}

export class WatchChatGPTInboxHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const service = requireService(this.services);
    service.startWatching();
    new Notice(`${PLUGIN_PREFIX} Watching the ChatGPT inbox folder.`);
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-watch-inbox", name: "Watch ChatGPT inbox", icon: "eye" };
  }
}

export class StopWatchingChatGPTInboxHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    requireService(this.services).stopWatching();
    new Notice(`${PLUGIN_PREFIX} Stopped watching the ChatGPT inbox folder.`);
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-stop-watching-inbox", name: "Stop watching ChatGPT inbox", icon: "eye-off" };
  }
}

export class RetryFailedConversationsHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    await report("Retry", requireService(this.services).retryFailed());
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-retry-failed", name: "Retry failed ChatGPT conversations", icon: "refresh-cw" };
  }
}

export class RebuildKnowledgeIndexHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const paths = await requireService(this.services).rebuildIndexes();
      new Notice(`${PLUGIN_PREFIX} Rebuilt ${paths.length} index notes.`);
    } catch (error) {
      new Notice(`${PLUGIN_PREFIX} Rebuild failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-rebuild-index", name: "Rebuild knowledge index", icon: "list-tree" };
  }
}

export class ViewKnowledgeStatusHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    new KnowledgeStatusModal(this.services.app, requireService(this.services)).open();
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-view-status", name: "View ChatGPT import status", icon: "activity" };
  }
}

export class OpenReviewQueueHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const service = requireService(this.services);
    const path = await service.reviewQueuePath();
    const file = this.services.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice(
        `${PLUGIN_PREFIX} Review queue note not found in this vault (${path}). It lives in your personal vault.`
      );
      return;
    }
    await this.services.app.workspace.openLinkText(path, "", false);
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-open-review-queue", name: "Open knowledge review queue", icon: "clipboard-list" };
  }
}

export class DryRunRoutingHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const service = requireService(this.services);
    try {
      const summary = await service.dryRun([]);
      if (!summary) return;
      const lines = summary.routingPreview
        .slice(0, 25)
        .map(
          (preview) => `${preview.kind}: ${preview.unit} -> ${preview.vault}/${preview.folder} (${preview.confidence})`
        );
      new Notice(
        `${PLUGIN_PREFIX} Dry run over the archive: ${summary.routingPreview.length} units planned.\n${lines.join("\n")}`,
        15000
      );
    } catch (error) {
      new Notice(`${PLUGIN_PREFIX} Dry run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-dry-run-routing", name: "Dry run knowledge routing", icon: "route" };
  }
}

export class ConfigureVaultRouterHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const vaults = await requireService(this.services).describeVaults();
    new Notice(
      `${PLUGIN_PREFIX} Vaults visible to the router:\n${vaults.join("\n")}\n\nEdit the registry in Settings > ChatGPT MD > Knowledge Importer.`,
      15000
    );
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-configure-vault-router", name: "Configure vault router", icon: "settings-2" };
  }
}

interface ConversationItem {
  conversationId: string;
  title: string;
  state: string;
}

/** Picker for re-running extraction on one conversation. */
export class ConversationSuggestModal extends SuggestModal<ConversationItem> {
  constructor(
    app: ServiceContainer["app"],
    private readonly items: ConversationItem[],
    private readonly onChoose: (item: ConversationItem) => void
  ) {
    super(app);
    this.setPlaceholder(items.length > 0 ? "Select a conversation to reprocess" : "No conversations imported yet");
  }

  getSuggestions(query: string): ConversationItem[] {
    const needle = query.toLowerCase();
    return this.items.filter((item) => !needle || item.title.toLowerCase().includes(needle)).slice(0, 200);
  }

  renderSuggestion(item: ConversationItem, element: HTMLElement): void {
    element.createEl("div", { text: item.title });
    element.createEl("small", { text: `${item.state} - ${item.conversationId}` });
  }

  onChooseSuggestion(item: ConversationItem): void {
    this.onChoose(item);
  }
}

export class ReprocessConversationHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const service = requireService(this.services);
    const conversations = await service.listConversations();
    if (conversations.length === 0) {
      new Notice(`${PLUGIN_PREFIX} No conversations have been imported yet.`);
      return;
    }
    new ConversationSuggestModal(this.services.app, conversations, (item) => {
      void report("Reprocess", service.reprocess([item.conversationId]));
    }).open();
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-reprocess-conversation", name: "Reprocess a ChatGPT conversation", icon: "rotate-ccw" };
  }
}

export class ReprocessAllHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    await report("Reprocess all", requireService(this.services).reprocessAll());
  }

  getCommand(): CommandMetadata {
    return {
      id: "knowledge-reprocess-all",
      name: "Reprocess all conversations with the current processing version",
      icon: "rotate-cw",
    };
  }
}
