import { App, Modal } from "obsidian";
import { WebSearchApprovalDecision, WebSearchResult } from "src/Models/Tool";

/**
 * Modal for approving web search results before sharing with the LLM
 */
export class WebSearchApprovalModal extends Modal {
  private resolvePromise: ((decision: WebSearchApprovalDecision) => void) | null = null;
  private selectedResults: Map<string, boolean>;

  constructor(
    app: App,
    private query: string,
    private results: WebSearchResult[],
    private modelName: string = "AI"
  ) {
    super(app);
    // Initialize all results as selected
    this.selectedResults = new Map(results.map((r) => [r.url, true]));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("websearch-approval-modal");

    // Title
    const header = contentEl.createEl("h2", { text: "ChatGPT MD - Web Search Results" });
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
    const resultsLabel = contentEl.createEl("p", { text: "Select which results to share:" });
    resultsLabel.style.marginTop = "8px";
    resultsLabel.style.marginBottom = "8px";
    resultsLabel.style.fontWeight = "500";
    resultsLabel.style.opacity = "0.7";

    // Results selection container
    const resultsContainer = contentEl.createDiv();
    resultsContainer.style.marginBottom = "12px";

    for (const result of this.results) {
      const currentValue = this.selectedResults.get(result.url) ?? true;

      const resultItem = resultsContainer.createDiv();
      resultItem.style.display = "flex";
      resultItem.style.alignItems = "flex-start";
      resultItem.style.padding = "8px";
      resultItem.style.marginBottom = "8px";
      resultItem.style.borderRadius = "4px";
      resultItem.style.backgroundColor = "var(--background-secondary)";
      resultItem.style.gap = "8px";

      const checkbox = resultItem.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = currentValue;
      checkbox.style.marginTop = "2px";
      checkbox.style.flexShrink = "0";
      checkbox.onchange = () => {
        this.selectedResults.set(result.url, checkbox.checked);
      };

      const label = resultItem.createEl("label");
      label.style.flex = "1";
      label.style.cursor = "pointer";
      label.style.display = "flex";
      label.style.flexDirection = "column";
      label.style.gap = "4px";

      const titleEl = label.createEl("div", { text: result.title });
      titleEl.style.fontWeight = "500";
      titleEl.style.fontSize = "0.95em";

      const urlEl = label.createEl("a", {
        text: result.url,
        href: result.url,
      });
      urlEl.style.fontSize = "0.8em";
      urlEl.style.opacity = "0.6";
      urlEl.setAttr("target", "_blank");

      if (result.snippet) {
        const snippetEl = label.createEl("div", {
          text: result.snippet.substring(0, 150) + (result.snippet.length > 150 ? "..." : ""),
        });
        snippetEl.style.fontSize = "0.85em";
        snippetEl.style.opacity = "0.7";
        snippetEl.style.lineHeight = "1.3";
      }

      label.onclick = () => {
        checkbox.checked = !checkbox.checked;
        this.selectedResults.set(result.url, checkbox.checked);
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
      this.results.forEach((r) => this.selectedResults.set(r.url, true));
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
      this.results.forEach((r) => this.selectedResults.set(r.url, false));
      const { contentEl } = this;
      contentEl.empty();
      this.onOpen();
    };

    // Data control note
    const controlNote = contentEl.createEl("p", {
      text: "You control what data is shared. Only selected results will be visible to the AI. Deselected results remain private.",
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
      this.resolvePromise?.({
        approved: false,
        approvedResults: [],
      });
      this.close();
    };

    const approveBtn = buttonContainer.createEl("button", { text: "Share Selected Results" });
    approveBtn.style.padding = "8px 16px";
    approveBtn.style.borderRadius = "4px";
    approveBtn.style.border = "none";
    approveBtn.style.backgroundColor = "var(--interactive-accent)";
    approveBtn.style.color = "var(--text-on-accent)";
    approveBtn.style.cursor = "pointer";
    approveBtn.style.fontWeight = "500";
    approveBtn.onclick = () => {
      const approved = this.getApprovedResults();
      this.resolvePromise?.({
        approved: true,
        approvedResults: approved,
      });
      this.close();
    };
  }

  private getApprovedResults(): WebSearchResult[] {
    return this.results.filter((r) => this.selectedResults.get(r.url) === true);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();

    // If modal was closed without a decision, treat as cancelled
    if (this.resolvePromise) {
      this.resolvePromise({
        approved: false,
        approvedResults: [],
      });
    }
  }

  /**
   * Wait for user to make a decision
   */
  waitForResult(): Promise<WebSearchApprovalDecision> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}
