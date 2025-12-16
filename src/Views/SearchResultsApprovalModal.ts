import { App, Modal } from "obsidian";
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
    private results: VaultSearchResult[],
    private modelName: string = "AI"
  ) {
    super(app);

    // Create promise that will be resolved when user makes decision
    this.modalPromise = new Promise((resolve) => {
      this.resolveModalPromise = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("search-results-approval-modal");

    // Title
    const header = contentEl.createEl("h2", { text: "ChatGPT MD - Vault Search Results" });
    header.style.marginBottom = "12px";
    header.style.fontWeight = "600";

    // Minimal description
    const descriptionEl = contentEl.createEl("p", {
      text: `${this.results.length} result${this.results.length !== 1 ? "s" : ""} have been found and can be shared with '${this.modelName}'.`,
    });
    descriptionEl.style.marginBottom = "16px";
    descriptionEl.style.lineHeight = "1.5";
    descriptionEl.style.fontSize = "0.95em";

    // Results label
    const resultsLabel = contentEl.createEl("p", { text: "Select which files to share:" });
    resultsLabel.style.marginTop = "8px";
    resultsLabel.style.marginBottom = "8px";
    resultsLabel.style.fontWeight = "500";
    resultsLabel.style.opacity = "0.7";

    // Results selection container
    const resultsContainer = contentEl.createDiv();
    resultsContainer.style.marginBottom = "12px";

    // Initialize all results as selected by default (if not already set)
    for (const result of this.results) {
      if (!this.resultSelections.has(result.path)) {
        this.resultSelections.set(result.path, true);
      }

      const currentValue = this.resultSelections.get(result.path) || false;

      // Extract actual path from markdown link format if needed
      // Path may be formatted as "[basename](path)" or plain path
      let displayPath = result.path;
      const markdownMatch = result.path.match(/\]\((.*?)\)$/);
      if (markdownMatch) {
        displayPath = markdownMatch[1];
      }

      const resultItem = resultsContainer.createDiv();
      resultItem.style.display = "flex";
      resultItem.style.alignItems = "center";
      resultItem.style.padding = "8px";
      resultItem.style.marginBottom = "4px";
      resultItem.style.borderRadius = "4px";
      resultItem.style.backgroundColor = "var(--background-secondary)";

      const checkbox = resultItem.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = currentValue;
      checkbox.style.marginRight = "8px";
      checkbox.onchange = () => {
        this.resultSelections.set(result.path, checkbox.checked);
      };

      const label = resultItem.createEl("label");
      label.style.flex = "1";
      label.style.cursor = "pointer";

      const nameEl = label.createEl("div", { text: result.basename });
      nameEl.style.fontWeight = "500";
      nameEl.style.fontSize = "0.95em";

      const pathEl = label.createEl("div", { text: displayPath });
      pathEl.style.fontSize = "0.85em";
      pathEl.style.opacity = "0.6";
      pathEl.style.marginTop = "2px";

      label.onclick = () => {
        checkbox.checked = !checkbox.checked;
        this.resultSelections.set(result.path, checkbox.checked);
      };
    }

    // Select/Deselect all buttons
    const buttonRow = contentEl.createDiv();
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "8px";
    buttonRow.style.marginBottom = "16px";

    const selectAllBtn = buttonRow.createEl("button", { text: "Select All" });
    selectAllBtn.style.flex = "1";
    selectAllBtn.style.padding = "6px 12px";
    selectAllBtn.style.borderRadius = "4px";
    selectAllBtn.style.border = "1px solid var(--background-modifier-border)";
    selectAllBtn.style.backgroundColor = "transparent";
    selectAllBtn.style.cursor = "pointer";
    selectAllBtn.style.fontSize = "0.9em";
    selectAllBtn.onclick = () => {
      this.results.forEach((result) => this.resultSelections.set(result.path, true));
      const { contentEl } = this;
      contentEl.empty();
      this.onOpen();
    };

    const deselectAllBtn = buttonRow.createEl("button", { text: "Deselect All" });
    deselectAllBtn.style.flex = "1";
    deselectAllBtn.style.padding = "6px 12px";
    deselectAllBtn.style.borderRadius = "4px";
    deselectAllBtn.style.border = "1px solid var(--background-modifier-border)";
    deselectAllBtn.style.backgroundColor = "transparent";
    deselectAllBtn.style.cursor = "pointer";
    deselectAllBtn.style.fontSize = "0.9em";
    deselectAllBtn.onclick = () => {
      this.results.forEach((result) => this.resultSelections.set(result.path, false));
      const { contentEl } = this;
      contentEl.empty();
      this.onOpen();
    };

    // Data control note
    const controlNote = contentEl.createEl("p", {
      text: "You control what data is shared. The AI will only know about files you select. Deselected files remain private.",
    });
    controlNote.style.marginTop = "16px";
    controlNote.style.marginBottom = "20px";
    controlNote.style.padding = "12px";
    controlNote.style.backgroundColor = "var(--background-secondary)";
    controlNote.style.borderRadius = "6px";
    controlNote.style.fontSize = "0.9em";
    controlNote.style.lineHeight = "1.4";
    controlNote.style.opacity = "0.85";

    // Buttons
    const buttonContainer = contentEl.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "20px";

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.style.padding = "8px 16px";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.border = "1px solid var(--background-modifier-border)";
    cancelBtn.style.backgroundColor = "transparent";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.onclick = () => {
      this.result = {
        approved: false,
        approvedResults: [],
      };
      this.resolveModalPromise(this.result);
      this.close();
    };

    const approveBtn = buttonContainer.createEl("button", { text: "Approve and Continue" });
    approveBtn.style.padding = "8px 16px";
    approveBtn.style.borderRadius = "4px";
    approveBtn.style.border = "none";
    approveBtn.style.backgroundColor = "var(--interactive-accent)";
    approveBtn.style.color = "var(--text-on-accent)";
    approveBtn.style.cursor = "pointer";
    approveBtn.style.fontWeight = "500";
    approveBtn.onclick = () => {
      this.result = {
        approved: true,
        approvedResults: this.getApprovedResults(),
      };
      this.resolveModalPromise(this.result);
      this.close();
    };
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
