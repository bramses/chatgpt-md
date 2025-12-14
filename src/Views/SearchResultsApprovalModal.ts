import { App, Modal, Setting } from "obsidian";
import { SearchResultsApprovalDecision, VaultSearchResult } from "src/Models/Tool";

/**
 * Modal for approving search results before they are sent to the LLM
 */
export class SearchResultsApprovalModal extends Modal {
  private result: SearchResultsApprovalDecision | null = null;
  private modalPromise: Promise<SearchResultsApprovalDecision>;
  private resolveModalPromise: (value: SearchResultsApprovalDecision) => void;
  private resultSelections: Map<string, boolean> = new Map();

  constructor(
    app: App,
    private query: string,
    private results: VaultSearchResult[]
  ) {
    super(app);

    // Create promise that will be resolved when user makes decision
    this.modalPromise = new Promise((resolve) => {
      this.resolveModalPromise = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;

    // Title
    contentEl.createEl("h2", { text: "[ChatGPT MD] Search Results Review" });

    // Search query info
    contentEl.createEl("p", {
      text: `Search query: "${this.query}"`,
      cls: "mod-muted",
    });

    // Results count
    contentEl.createEl("p", {
      text: `Found ${this.results.length} result(s). Please select which files the AI should know about:`,
    });

    // Results selection
    const resultsContainer = contentEl.createDiv({ cls: "search-results-list" });

    // Initialize all results as selected by default (if not already set)
    for (const result of this.results) {
      if (!this.resultSelections.has(result.path)) {
        this.resultSelections.set(result.path, true);
      }

      const currentValue = this.resultSelections.get(result.path) || false;

      new Setting(resultsContainer)
        .setName(result.basename)
        .setDesc(result.path)
        .addToggle((toggle) =>
          toggle.setValue(currentValue).onChange((value) => {
            this.resultSelections.set(result.path, value);
          })
        );
    }

    // Select/Deselect all buttons
    const selectButtonContainer = new Setting(contentEl);

    selectButtonContainer.addButton((btn) =>
      btn.setButtonText("Select All").onClick(() => {
        this.results.forEach((result) => this.resultSelections.set(result.path, true));
        // Refresh modal
        const { contentEl } = this;
        contentEl.empty();
        this.onOpen();
      })
    );

    selectButtonContainer.addButton((btn) =>
      btn.setButtonText("Deselect All").onClick(() => {
        this.results.forEach((result) => this.resultSelections.set(result.path, false));
        // Refresh modal
        const { contentEl } = this;
        contentEl.empty();
        this.onOpen();
      })
    );

    // Privacy warning
    const warningContainer = contentEl.createDiv({ cls: "mod-warning" });
    warningContainer.createEl("p", {
      text: "⚠️ Privacy Note: The AI will only know about the files you select here. Files you deselect will be completely hidden from the AI.",
    });

    // Buttons
    const buttonContainer = new Setting(contentEl);

    buttonContainer.addButton((btn) =>
      btn
        .setButtonText("Approve and Continue")
        .setCta()
        .onClick(() => {
          this.result = {
            approved: true,
            approvedResults: this.getApprovedResults(),
          };
          this.resolveModalPromise(this.result);
          this.close();
        })
    );

    buttonContainer.addButton((btn) =>
      btn.setButtonText("Cancel").onClick(() => {
        this.result = {
          approved: false,
          approvedResults: [],
        };
        this.resolveModalPromise(this.result);
        this.close();
      })
    );
  }

  /**
   * Get the approved search results
   */
  private getApprovedResults(): VaultSearchResult[] {
    const approved = this.results.filter((result) => this.resultSelections.get(result.path) === true);

    console.log("[ChatGPT MD] Search results approval:", {
      query: this.query,
      totalResults: this.results.length,
      approvedCount: approved.length,
      approvedPaths: approved.map((r) => r.path),
    });

    return approved;
  }

  /**
   * Wait for user decision
   */
  waitForResult(): Promise<SearchResultsApprovalDecision> {
    return this.modalPromise;
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();

    // If modal closed without decision, treat as cancel
    if (!this.result) {
      this.resolveModalPromise({
        approved: false,
        approvedResults: [],
      });
    }
  }
}
