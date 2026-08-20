import { App, Modal, Setting } from "obsidian";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";

/**
 * Sync status: what is known, what is done, what is waiting, and which vaults
 * the router can currently reach.
 */
export class KnowledgeStatusModal extends Modal {
  constructor(
    app: App,
    private readonly service: KnowledgeImportService
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "ChatGPT knowledge status" });

    const status = await this.service.status();
    [
      `Total known conversations: ${status.totalKnown}`,
      `Source archived: ${status.archived}`,
      `Semantically processed: ${status.processed}`,
      `Pending: ${status.pending}`,
      `Skipped (nothing durable): ${status.skipped}`,
      `Failed: ${status.failed}`,
      `Awaiting review: ${status.awaitingReview}`,
      `Readings retired or historical: ${status.retiredModels}`,
      `Readings due for review: ${status.dueForReview}`,
      `Processed with an older processing version: ${status.staleProcessingVersion}`,
      `Last ingestion: ${status.lastIngestionAt || "never"}`,
      `Last reconciliation: ${status.lastReconciliationAt || "never"}`,
      `Inbox watching: ${this.service.isWatching() ? "on" : "off"}`,
    ].forEach((line) => contentEl.createEl("p", { text: line }));

    if (status.lastRun) {
      contentEl.createEl("h3", { text: "Last run" });
      const run = status.lastRun;
      contentEl.createEl("p", {
        text:
          `${run.mode} started ${run.startedAt}, ${run.finishedAt ? `finished ${run.finishedAt}` : "interrupted"} - ` +
          `${run.conversationsProcessed} processed, ${run.unitsWritten} units, ${run.conversationsFailed} failed`,
      });
    }

    contentEl.createEl("p", {
      text: "The vault holds written traces only: not your body, your ordinary days, what you kept private, or what has not happened yet.",
    });

    contentEl.createEl("h3", { text: "Vaults visible to the router" });
    const vaults = await this.service.describeVaults();
    if (vaults.length === 0) {
      contentEl.createEl("p", { text: "No vaults resolved. Configure the vault registry in settings." });
    }
    vaults.forEach((vault) => contentEl.createEl("p", { text: vault }));

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Close")
        .setCta()
        .onClick(() => this.close())
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
