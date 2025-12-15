import { App, Modal, Setting } from "obsidian";
import { WebSearchResult, WebSearchApprovalDecision } from "src/Models/Tool";

/**
 * Modal for approving web search results before sharing with the LLM
 */
export class WebSearchApprovalModal extends Modal {
  private resolvePromise: ((decision: WebSearchApprovalDecision) => void) | null = null;
  private selectedResults: Map<string, boolean>;

  constructor(
    app: App,
    private query: string,
    private results: WebSearchResult[]
  ) {
    super(app);
    // Initialize all results as selected
    this.selectedResults = new Map(results.map((r) => [r.url, true]));
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("chatgpt-md-websearch-approval-modal");

    // Header
    contentEl.createEl("h2", { text: "Web Search Results" });

    // Query info
    const queryInfo = contentEl.createDiv({ cls: "websearch-query-info" });
    queryInfo.createEl("strong", { text: "Search query: " });
    queryInfo.createEl("span", { text: `"${this.query}"` });

    // Results count
    contentEl.createEl("p", {
      text: `Found ${this.results.length} result${this.results.length !== 1 ? "s" : ""}. Select which results to share with the AI:`,
      cls: "websearch-results-count",
    });

    // Select All / Deselect All buttons
    const buttonContainer = contentEl.createDiv({ cls: "websearch-button-container" });

    const selectAllBtn = buttonContainer.createEl("button", {
      text: "Select All",
      cls: "mod-cta",
    });
    selectAllBtn.addEventListener("click", () => {
      this.results.forEach((r) => this.selectedResults.set(r.url, true));
      this.refreshResults();
    });

    const deselectAllBtn = buttonContainer.createEl("button", {
      text: "Deselect All",
    });
    deselectAllBtn.addEventListener("click", () => {
      this.results.forEach((r) => this.selectedResults.set(r.url, false));
      this.refreshResults();
    });

    // Results container
    const resultsContainer = contentEl.createDiv({ cls: "websearch-results-container" });
    this.renderResults(resultsContainer);

    // Privacy warning
    const warningEl = contentEl.createDiv({ cls: "websearch-privacy-warning" });
    warningEl.createEl("p", {
      text: "Only selected results will be shared with the AI. Deselected results will not be visible to the AI.",
    });

    // Action buttons
    const actionContainer = contentEl.createDiv({ cls: "websearch-action-buttons" });

    const cancelBtn = actionContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.resolvePromise?.({
        approved: false,
        approvedResults: [],
      });
      this.close();
    });

    const approveBtn = actionContainer.createEl("button", {
      text: "Share Selected Results",
      cls: "mod-cta",
    });
    approveBtn.addEventListener("click", () => {
      const approved = this.getApprovedResults();
      this.resolvePromise?.({
        approved: true,
        approvedResults: approved,
      });
      this.close();
    });
  }

  private renderResults(container: HTMLElement): void {
    container.empty();

    for (const result of this.results) {
      const resultEl = container.createDiv({ cls: "websearch-result-item" });

      new Setting(resultEl)
        .setName(result.title)
        .setDesc(this.createResultDescription(result))
        .addToggle((toggle) =>
          toggle.setValue(this.selectedResults.get(result.url) ?? true).onChange((value) => {
            this.selectedResults.set(result.url, value);
          })
        );
    }
  }

  private createResultDescription(result: WebSearchResult): DocumentFragment {
    const fragment = document.createDocumentFragment();

    // URL
    const urlEl = fragment.createEl("a", {
      text: result.url,
      href: result.url,
      cls: "websearch-result-url",
    });
    urlEl.setAttr("target", "_blank");

    // Snippet
    if (result.snippet) {
      fragment.createEl("br");
      fragment.createEl("span", {
        text: result.snippet.substring(0, 200) + (result.snippet.length > 200 ? "..." : ""),
        cls: "websearch-result-snippet",
      });
    }

    return fragment;
  }

  private refreshResults(): void {
    const container = this.contentEl.querySelector(".websearch-results-container");
    if (container) {
      this.renderResults(container as HTMLElement);
    }
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
