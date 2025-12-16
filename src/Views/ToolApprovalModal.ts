import { App, Modal, Setting } from "obsidian";
import { ToolApprovalDecision } from "src/Models/Tool";

/**
 * Modal for approving AI tool calls
 */
export class ToolApprovalModal extends Modal {
  private result: ToolApprovalDecision | null = null;
  private modalPromise: Promise<ToolApprovalDecision>;
  private resolveModalPromise: (value: ToolApprovalDecision) => void;
  private fileSelections: Map<string, boolean> = new Map();

  constructor(
    app: App,
    private toolName: string,
    private args: Record<string, any>,
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
    contentEl.addClass("tool-approval-modal");

    // Title with human-readable tool name
    const header = contentEl.createEl("h2", { text: this.getToolDisplayName() });
    header.style.marginBottom = "12px";
    header.style.fontWeight = "600";

    // Description with details
    this.renderRequestDescription(contentEl);

    // File selection for file_read tool
    if (this.toolName === "file_read" && this.args && Array.isArray(this.args.filePaths)) {
      this.renderFileSelection(contentEl, this.args.filePaths);
    }

    // For search tools, explain there will be another approval for results
    if (this.toolName === "vault_search" || this.toolName === "web_search") {
      const searchApprovalNote = contentEl.createEl("p", {
        text: "After the search completes, you'll review and approve the results before they're shared with the AI.",
      });
      searchApprovalNote.style.marginTop = "16px";
      searchApprovalNote.style.marginBottom = "20px";
      searchApprovalNote.style.padding = "12px";
      searchApprovalNote.style.backgroundColor = "var(--background-secondary)";
      searchApprovalNote.style.borderRadius = "4px";
      searchApprovalNote.style.fontSize = "0.9em";
      searchApprovalNote.style.lineHeight = "1.4";
      searchApprovalNote.style.opacity = "0.85";
    }

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
        approvalId: this.toolName,
        approved: false,
      };
      this.resolveModalPromise(this.result);
      this.close();
    };

    const approveBtn = buttonContainer.createEl("button", { text: "Approve and Execute" });
    approveBtn.style.padding = "8px 16px";
    approveBtn.style.borderRadius = "4px";
    approveBtn.style.border = "none";
    approveBtn.style.backgroundColor = "var(--interactive-accent)";
    approveBtn.style.color = "var(--text-on-accent)";
    approveBtn.style.cursor = "pointer";
    approveBtn.style.fontWeight = "500";
    approveBtn.onclick = () => {
      this.result = {
        approvalId: this.toolName,
        approved: true,
        modifiedArgs: this.getModifiedArgs(),
      };
      this.resolveModalPromise(this.result);
      this.close();
    };
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
      if (!this.fileSelections.has(path)) {
        this.fileSelections.set(path, true);
      }

      const fileName = path.split("/").pop() || path;
      const currentValue = this.fileSelections.get(path) || false;

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
        this.fileSelections.set(path, checkbox.checked);
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
        this.fileSelections.set(path, checkbox.checked);
      };
    }

    // Select/Deselect all buttons
    const buttonRow = container.createDiv();
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
      filePaths.forEach((path) => this.fileSelections.set(path, true));
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
      filePaths.forEach((path) => this.fileSelections.set(path, false));
      const { contentEl } = this;
      contentEl.empty();
      this.onOpen();
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
      const selectedFiles = Array.from(this.fileSelections.entries())
        .filter(([_, selected]) => selected)
        .map(([path, _]) => path);

      console.log("[ChatGPT MD] File selections:", {
        original: baseArgs.filePaths,
        selected: selectedFiles,
        selections: Array.from(this.fileSelections.entries()),
      });

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
          document.createTextNode(
            ` requests to read ${files?.length || 0} file${files?.length !== 1 ? "s" : ""}:`
          )
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

  /**
   * Get display name for tool
   */
  private getToolDisplayName(): string {
    const displayNames: Record<string, string> = {
      vault_search: "ChatGPT MD - Vault Search",
      file_read: "ChatGPT MD - File Read",
      web_search: "ChatGPT MD - Web Search",
    };
    return displayNames[this.toolName] || this.toolName;
  }

  /**
   * Get purpose description for tool
   */
  private getToolPurpose(): string {
    const purposes: Record<string, string> = {
      vault_search:
        "Search your vault for files matching the query. Returns file names and content previews. The current note is excluded.",
      file_read:
        "Read the full contents of the specified files. You can select which files you want to share with the AI.",
      web_search:
        "Search the web for information using Brave Search. Returns relevant web pages with titles, URLs, and snippets.",
    };
    return purposes[this.toolName] || "Execute a tool operation.";
  }

  /**
   * Wait for user decision
   */
  waitForResult(): Promise<ToolApprovalDecision> {
    return this.modalPromise;
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();

    // If modal closed without decision, treat as cancel
    if (!this.result) {
      this.resolveModalPromise({
        approvalId: this.toolName,
        approved: false,
      });
    }
  }
}
