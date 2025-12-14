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
    private args: Record<string, any>
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
    contentEl.createEl("h2", { text: "[ChatGPT MD] Tool Approval Request" });

    // Tool information
    contentEl.createEl("p", {
      text: `The AI wants to use the following tool:`,
    });

    contentEl.createEl("h3", { text: this.getToolDisplayName() });

    // Purpose
    contentEl.createEl("p", {
      text: this.getToolPurpose(),
      cls: "mod-muted",
    });

    // Arguments section
    const argsContainer = contentEl.createDiv({ cls: "tool-args-container" });
    argsContainer.createEl("h4", { text: "Arguments:" });

    const argsList = argsContainer.createEl("ul");

    // Safely iterate over args if they exist
    if (this.args && typeof this.args === 'object') {
      for (const [key, value] of Object.entries(this.args)) {
        const displayValue = Array.isArray(value) && value.length > 3
          ? `[${value.slice(0, 3).join(', ')}... (${value.length} total)]`
          : JSON.stringify(value);
        argsList.createEl("li", { text: `${key}: ${displayValue}` });
      }
    } else {
      argsList.createEl("li", { text: "(no arguments)" });
    }

    // File selection for file_read tool
    if (this.toolName === "file_read" && this.args && Array.isArray(this.args.filePaths)) {
      this.renderFileSelection(contentEl, this.args.filePaths);
    }

    // Privacy warning
    const warningContainer = contentEl.createDiv({ cls: "mod-warning" });
    warningContainer.createEl("p", {
      text: "⚠️ Privacy Note: This tool will access your vault data. Only approve if you understand and trust this action.",
    });

    // Buttons
    const buttonContainer = new Setting(contentEl);

    buttonContainer.addButton((btn) =>
      btn
        .setButtonText("Approve and Execute")
        .setCta()
        .onClick(() => {
          this.result = {
            approvalId: this.toolName,
            approved: true,
            modifiedArgs: this.getModifiedArgs(),
          };
          this.resolveModalPromise(this.result);
          this.close();
        })
    );

    buttonContainer.addButton((btn) =>
      btn
        .setButtonText("Cancel")
        .onClick(() => {
          this.result = {
            approvalId: this.toolName,
            approved: false,
          };
          this.resolveModalPromise(this.result);
          this.close();
        })
    );
  }

  /**
   * Render file selection UI for file_read tool
   */
  private renderFileSelection(container: HTMLElement, filePaths: string[]): void {
    container.createEl("h4", { text: "Select files to share with AI:" });

    const fileListContainer = container.createDiv({ cls: "file-selection-list" });

    // Initialize all files as selected by default
    for (const path of filePaths) {
      this.fileSelections.set(path, true);

      const fileName = path.split('/').pop() || path;

      new Setting(fileListContainer)
        .setName(fileName)
        .setDesc(path)
        .addToggle((toggle) =>
          toggle.setValue(true).onChange((value) => {
            this.fileSelections.set(path, value);
          })
        );
    }

    // Select/Deselect all buttons
    const selectButtonContainer = new Setting(container);

    selectButtonContainer.addButton((btn) =>
      btn
        .setButtonText("Select All")
        .onClick(() => {
          filePaths.forEach(path => this.fileSelections.set(path, true));
          // Refresh modal
          const { contentEl } = this;
          contentEl.empty();
          this.onOpen();
        })
    );

    selectButtonContainer.addButton((btn) =>
      btn
        .setButtonText("Deselect All")
        .onClick(() => {
          filePaths.forEach(path => this.fileSelections.set(path, false));
          // Refresh modal
          const { contentEl } = this;
          contentEl.empty();
          this.onOpen();
        })
    );
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

      return {
        ...baseArgs,
        filePaths: selectedFiles,
      };
    }

    return baseArgs;
  }

  /**
   * Get display name for tool
   */
  private getToolDisplayName(): string {
    const displayNames: Record<string, string> = {
      vault_search: "Vault Search",
      file_read: "File Read",
    };
    return displayNames[this.toolName] || this.toolName;
  }

  /**
   * Get purpose description for tool
   */
  private getToolPurpose(): string {
    const purposes: Record<string, string> = {
      vault_search: "Search your vault for files matching the query. Returns file names and content previews.",
      file_read: "Read the full contents of the specified files. You can select which files to share.",
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
