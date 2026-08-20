import { App, Modal, Notice, Setting } from "obsidian";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";
import { ImportProgress, ImportSummary } from "src/Services/Knowledge/ImportCoordinator";
import { Logger } from "src/Utilities/Logger";

export type ImportModalMode = "import" | "dry-run" | "source-only";

/**
 * Entry point for the historical import and for later reconciliation runs.
 *
 * The user points at an export ZIP or `conversations.json`, picks how much of
 * the pipeline to run, and watches progress. Everything is resumable, so
 * closing the modal or quitting Obsidian never loses work.
 */
export class KnowledgeImportModal extends Modal {
  private ref = "";
  private mode: ImportModalMode = "import";
  private progressEl?: HTMLElement;
  private summaryEl?: HTMLElement;
  private started = false;

  constructor(
    app: App,
    private readonly service: KnowledgeImportService
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Import ChatGPT history" });
    contentEl.createEl("p", {
      text:
        "Select your official ChatGPT export. Every conversation is archived unchanged first, then the meaning inside it is routed into your vaults. " +
        "Re-running is safe: conversations that have not changed are skipped.",
    });

    new Setting(contentEl)
      .setName("Export file")
      .setDesc(
        "Path to the export ZIP or conversations.json. Absolute paths work on desktop; otherwise use a path inside this vault."
      )
      .addText((text) =>
        text.setPlaceholder("C:\\Users\\you\\Downloads\\chatgpt-export.zip").onChange((value) => {
          this.ref = value.trim();
        })
      );

    new Setting(contentEl)
      .setName("What to run")
      .setDesc(
        "A dry run plans everything and writes nothing. Archive only preserves sources without spending API calls."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            import: "Full import (archive + knowledge)",
            "dry-run": "Dry run (plan only, no writes)",
            "source-only": "Archive sources only",
          })
          .setValue(this.mode)
          .onChange((value) => {
            this.mode = value as ImportModalMode;
          })
      );

    this.progressEl = contentEl.createEl("p", { text: "" });
    this.summaryEl = contentEl.createEl("div");

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Start")
          .setCta()
          .onClick(() => void this.start())
      )
      .addButton((button) => button.setButtonText("Stop").onClick(() => this.service.abort()))
      .addButton((button) => button.setButtonText("Close").onClick(() => this.close()));
  }

  private async start(): Promise<void> {
    if (this.started) {
      new Notice("[ChatGPT MD] Import already running.");
      return;
    }
    if (!this.ref) {
      new Notice("[ChatGPT MD] Please enter the path to your export first.");
      return;
    }

    this.started = true;
    const onProgress = (progress: ImportProgress): void => this.renderProgress(progress);

    try {
      const summary =
        this.mode === "dry-run"
          ? await this.service.dryRun([this.ref], { onProgress })
          : this.mode === "source-only"
            ? await this.service.archiveOnly([this.ref], { onProgress })
            : await this.service.importExport([this.ref], { onProgress });
      this.renderSummary(summary);
    } catch (error) {
      Logger.error("[ChatGPT MD] Knowledge import failed", { error });
      new Notice(`[ChatGPT MD] Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.started = false;
    }
  }

  private renderProgress(progress: ImportProgress): void {
    if (!this.progressEl) return;
    const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    this.progressEl.setText(
      `${progress.phase}: ${progress.processed}/${progress.total} (${percent}%) - ${progress.unitsWritten} units written, ` +
        `${progress.queuedForReview} for review, ${progress.skipped} skipped, ${progress.failed} failed`
    );
  }

  private renderSummary(summary: ImportSummary | null): void {
    if (!this.summaryEl) return;
    this.summaryEl.empty();
    if (!summary) return;

    const run = summary.run;
    this.summaryEl.createEl("h3", { text: summary.aborted ? "Stopped (resumable)" : "Finished" });
    [
      `Conversations seen: ${run.conversationsSeen}`,
      `Source notes written: ${run.conversationsArchived}`,
      `Conversations processed: ${run.conversationsProcessed}`,
      `Skipped: ${run.conversationsSkipped}`,
      `Failed: ${run.conversationsFailed}`,
      `Knowledge units written: ${run.unitsWritten}`,
      `Queued for review: ${run.unitsQueuedForReview}`,
      `Approximate characters sent to the model: ${run.approxPromptChars}`,
    ].forEach((line) => this.summaryEl!.createEl("p", { text: line }));

    if (summary.plannedWrites) {
      const total = [...summary.plannedWrites.values()].reduce((sum, paths) => sum + paths.length, 0);
      this.summaryEl.createEl("p", { text: `Dry run: ${total} notes would be created or updated.` });
      summary.routingPreview.slice(0, 40).forEach((preview) => {
        this.summaryEl!.createEl("p", {
          text: `${preview.kind}: "${preview.unit}" -> ${preview.vault}/${preview.folder} (${preview.confidence}, ${preview.status})`,
        });
      });
    }

    if (summary.warnings.length > 0) {
      this.summaryEl.createEl("h4", { text: `Warnings (${summary.warnings.length})` });
      summary.warnings.slice(0, 20).forEach((warning) => this.summaryEl!.createEl("p", { text: warning }));
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
