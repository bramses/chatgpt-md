import { App } from "obsidian";
import { ToolApprovalDecision } from "src/Models/Tool";
import { BaseApprovalModal } from "./BaseApprovalModal";

/**
 * Modal for approving AI tool calls
 */
export class ToolApprovalModal extends BaseApprovalModal<ToolApprovalDecision> {
  private toolName: string;
  private args: Record<string, any>;

  constructor(app: App, toolName: string, args: Record<string, any>, modelName: string = "AI") {
    super(app, modelName);
    this.toolName = toolName;
    this.args = args;
  }

  protected getModalTitle(): string {
    const displayNames: Record<string, string> = {
      vault_search: "ChatGPT MD - Vault Search",
      file_read: "ChatGPT MD - File Read",
      web_search: "ChatGPT MD - Web Search",
    };
    return displayNames[this.toolName] || this.toolName;
  }

  protected getCssClass(): string {
    return "tool-approval-modal";
  }

  protected getDescription(): string {
    // Description is rendered separately in renderRequestDescription
    return "";
  }

  protected renderSelectionItems(container: HTMLElement): void {
    // First render the request description
    this.renderRequestDescription(container);

    // File selection for file_read tool
    if (this.toolName === "file_read" && this.args && Array.isArray(this.args.filePaths)) {
      this.renderFileSelection(container, this.args.filePaths);
    }
  }

  /**
   * Render file selection UI for file_read tool
   */
  private renderFileSelection(container: HTMLElement, filePaths: string[]): void {
    const fileSelectionLabel = container.createEl("p", { text: "Select files to share:" });
    fileSelectionLabel.style.marginTop = "16px";
    fileSelectionLabel.style.marginBottom = "8px";
    fileSelectionLabel.style.fontWeight = "500";
    fileSelectionLabel.style.opacity = "0.7";

    const fileListContainer = container.createDiv();
    fileListContainer.style.marginBottom = "12px";

    // Initialize all files as selected by default (if not already set)
    for (const path of filePaths) {
      // Only set to true if not already in the map (preserve user selections)
      if (!this.selections.has(path)) {
        this.selections.set(path, true);
      }

      const fileName = path.split("/").pop() || path;
      const currentValue = this.selections.get(path) || false;

      const fileItem = fileListContainer.createDiv();
      fileItem.style.display = "flex";
      fileItem.style.alignItems = "center";
      fileItem.style.padding = "8px";
      fileItem.style.marginBottom = "4px";
      fileItem.style.borderRadius = "4px";
      fileItem.style.backgroundColor = "var(--background-secondary)";

      const checkbox = fileItem.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = currentValue;
      checkbox.style.marginRight = "8px";
      checkbox.onchange = () => {
        this.selections.set(path, checkbox.checked);
      };

      const label = fileItem.createEl("label");
      label.style.flex = "1";
      label.style.cursor = "pointer";

      const nameEl = label.createEl("div", { text: fileName });
      nameEl.style.fontWeight = "500";
      nameEl.style.fontSize = "0.95em";

      const pathEl = label.createEl("div", { text: path });
      pathEl.style.fontSize = "0.85em";
      pathEl.style.opacity = "0.6";
      pathEl.style.marginTop = "2px";

      label.onclick = () => {
        checkbox.checked = !checkbox.checked;
        this.selections.set(path, checkbox.checked);
      };
    }
  }

  protected getControlNoteText(): string {
    // For search tools, explain there will be another approval for results
    if (this.toolName === "vault_search" || this.toolName === "web_search") {
      return "After the search completes, you'll review and approve the results before they're shared with the AI.";
    }
    // Override renderControlNote to not show it for file_read
    return "";
  }

  protected override renderControlNote(container: HTMLElement): void {
    if (this.toolName === "vault_search" || this.toolName === "web_search") {
      super.renderControlNote(container);
    }
    // No control note for file_read tool
  }

  protected getCancelText(): string {
    return "Cancel";
  }

  protected getApproveText(): string {
    return "Approve and Execute";
  }

  protected buildApprovedResult(): ToolApprovalDecision {
    return {
      approvalId: this.toolName,
      approved: true,
      modifiedArgs: this.getModifiedArgs(),
    };
  }

  protected buildCancelledResult(): ToolApprovalDecision {
    return {
      approvalId: this.toolName,
      approved: false,
    };
  }

  /**
   * Get modified arguments based on user selections
   */
  private getModifiedArgs(): Record<string, any> {
    // Default to empty object if args undefined
    const baseArgs = this.args || {};

    // For file_read, filter to only selected files
    if (this.toolName === "file_read" && baseArgs.filePaths) {
      const selectedFiles = Array.from(this.selections.entries())
        .filter(([_, selected]) => selected)
        .map(([path, _]) => path);

      return {
        ...baseArgs,
        filePaths: selectedFiles,
      };
    }

    return baseArgs;
  }

  /**
   * Render the request description with query in list format for search tools
   */
  private renderRequestDescription(container: HTMLElement): void {
    const query = (this.args?.query as string) || "";
    const files = this.args?.filePaths as string[] | undefined;

    // Intro text with model name in single quotes
    const introEl = container.createEl("p");
    introEl.style.marginBottom = "8px";
    introEl.style.lineHeight = "1.5";
    introEl.style.fontSize = "0.95em";

    // Add model name in single quotes
    introEl.appendChild(document.createTextNode(`'${this.modelName}'`));

    // Add the action text based on tool type
    switch (this.toolName) {
      case "vault_search":
        introEl.appendChild(document.createTextNode(" requests to search your vault for:"));
        break;
      case "file_read":
        introEl.appendChild(
          document.createTextNode(` requests to read ${files?.length || 0} file${files?.length !== 1 ? "s" : ""}:`)
        );
        break;
      case "web_search":
        introEl.appendChild(document.createTextNode(" requests to search the web for:"));
        break;
      default:
        introEl.appendChild(document.createTextNode(" requests to use a tool."));
    }

    // List for search queries
    if ((this.toolName === "vault_search" || this.toolName === "web_search") && query) {
      const list = container.createEl("ul");
      list.style.margin = "0 0 16px 20px";
      list.style.lineHeight = "1.5";
      list.createEl("li", { text: `"${query}"` });
    } else if (this.toolName === "file_read") {
      // For file_read, still just one line since files are shown in selection below
      const noteEl = container.createEl("p", {
        text: "You can select which files to share on the next screen.",
      });
      noteEl.style.marginBottom = "16px";
      noteEl.style.opacity = "0.7";
      noteEl.style.fontSize = "0.9em";
    } else {
      const noteEl = container.createEl("p", { text: "" });
      noteEl.style.marginBottom = "16px";
    }
  }

  protected refreshSelectionItems(): void {
    // Re-render the modal
    const { contentEl } = this;
    contentEl.empty();
    this.onOpen();
  }
}
