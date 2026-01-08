import { App } from "obsidian";
import { WebSearchApprovalDecision, WebSearchResult } from "src/Models/Tool";
import { BaseApprovalModal } from "./BaseApprovalModal";

/**
 * Modal for approving web search results before sharing with the LLM
 */
export class WebSearchApprovalModal extends BaseApprovalModal<WebSearchApprovalDecision> {
  private query: string;
  private results: WebSearchResult[];

  constructor(app: App, query: string, results: WebSearchResult[], modelName: string = "AI") {
    super(app, modelName);
    this.query = query;
    this.results = results;
    // Initialize all results as selected
    for (const result of results) {
      this.selections.set(result.url, true);
    }
  }

  protected getModalTitle(): string {
    return "ChatGPT MD - Web Search Results";
  }

  protected getCssClass(): string {
    return "websearch-approval-modal";
  }

  protected getDescription(): string {
    return `${this.results.length} result${this.results.length !== 1 ? "s" : ""} have been found and can be shared with '${this.modelName}'.`;
  }

  protected renderSelectionItems(container: HTMLElement): void {
    // Results label
    const resultsLabel = container.createEl("p", { text: "Select which results to share:" });
    resultsLabel.style.marginTop = "8px";
    resultsLabel.style.marginBottom = "8px";
    resultsLabel.style.fontWeight = "500";
    resultsLabel.style.opacity = "0.7";

    // Results selection container
    const resultsContainer = container.createDiv();
    resultsContainer.style.marginBottom = "12px";

    for (const result of this.results) {
      const currentValue = this.selections.get(result.url) ?? true;

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
        this.selections.set(result.url, checkbox.checked);
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
        this.selections.set(result.url, checkbox.checked);
      };
    }
  }

  protected getControlNoteText(): string {
    return "You control what data is shared. Only selected results will be visible to the AI. Deselected results remain private.";
  }

  protected getCancelText(): string {
    return "Cancel";
  }

  protected getApproveText(): string {
    return "Share Selected Results";
  }

  protected buildApprovedResult(): WebSearchApprovalDecision {
    const approvedResults = this.results.filter((r) => this.selections.get(r.url) === true);
    return {
      approved: true,
      approvedResults: approvedResults,
    };
  }

  protected buildCancelledResult(): WebSearchApprovalDecision {
    return {
      approved: false,
      approvedResults: [],
    };
  }

  protected refreshSelectionItems(): void {
    // Re-render the modal
    const { contentEl } = this;
    contentEl.empty();
    this.onOpen();
  }
}
