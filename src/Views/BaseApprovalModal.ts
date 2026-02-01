import { App, Modal } from "obsidian";

/**
 * Generic base class for approval modals
 * Handles promise management, UI rendering, and button handling
 * Uses Template Method pattern for customization
 */
export abstract class BaseApprovalModal<TDecision> extends Modal {
  // Generic promise management
  protected result: TDecision | null = null;
  protected modalPromise: Promise<TDecision>;
  protected resolveModalPromise: (value: TDecision) => void;
  protected selections: Map<string, boolean> = new Map();
  protected modelName: string;

  constructor(app: App, modelName: string = "AI") {
    super(app);
    this.modelName = modelName;
    this.modalPromise = new Promise((resolve) => {
      this.resolveModalPromise = resolve;
    });
  }

  /**
   * Abstract methods for subclasses to implement
   */
  protected abstract getModalTitle(): string;
  protected abstract getCssClass(): string;
  protected abstract getDescription(): string;
  protected abstract renderSelectionItems(container: HTMLElement): void;
  protected abstract getControlNoteText(): string;
  protected abstract getCancelText(): string;
  protected abstract getApproveText(): string;
  protected abstract buildApprovedResult(): TDecision;
  protected abstract buildCancelledResult(): TDecision;

  /**
   * Template method - defines the modal structure
   */
  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass(this.getCssClass());

    this.renderHeader(contentEl);
    this.renderDescription(contentEl);
    this.renderSelectionItems(contentEl);
    this.renderSelectAllButtons(contentEl);
    this.renderControlNote(contentEl);
    this.renderActionButtons(contentEl);
  }

  /**
   * Render modal header with title
   */
  protected renderHeader(container: HTMLElement): void {
    const header = container.createEl("h2", { text: this.getModalTitle() });
    header.style.marginBottom = "12px";
    header.style.fontWeight = "600";
  }

  /**
   * Render description text
   */
  protected renderDescription(container: HTMLElement): void {
    const desc = container.createEl("p", { text: this.getDescription() });
    desc.style.marginBottom = "12px";
    desc.style.opacity = "0.7";
  }

  /**
   * Render select/deselect all buttons
   */
  protected renderSelectAllButtons(container: HTMLElement): void {
    const buttonRow = container.createDiv();
    buttonRow.style.display = "flex";
    buttonRow.style.gap = "8px";
    buttonRow.style.marginBottom = "16px";

    const selectAllBtn = buttonRow.createEl("button", { text: "Select All" });
    this.styleSecondaryButton(selectAllBtn);
    selectAllBtn.style.flex = "1";
    selectAllBtn.onclick = () => {
      this.setAllSelections(true);
      this.refreshSelectionItems();
    };

    const deselectAllBtn = buttonRow.createEl("button", { text: "Deselect All" });
    this.styleSecondaryButton(deselectAllBtn);
    deselectAllBtn.style.flex = "1";
    deselectAllBtn.onclick = () => {
      this.setAllSelections(false);
      this.refreshSelectionItems();
    };
  }

  /**
   * Set all selections to the same value
   */
  protected setAllSelections(value: boolean): void {
    for (const key of this.selections.keys()) {
      this.selections.set(key, value);
    }
  }

  /**
   * Refresh selection items (to be called after select/deselect all)
   * Subclasses can override for custom refresh behavior
   */
  protected refreshSelectionItems(): void {
    // Default implementation - re-render the entire modal
    this.close();
    // Subclasses should override to update UI without closing
  }

  /**
   * Render control note with styling
   */
  protected renderControlNote(container: HTMLElement): void {
    const note = container.createEl("div", { text: this.getControlNoteText() });
    note.style.padding = "12px";
    note.style.backgroundColor = "var(--background-secondary)";
    note.style.borderRadius = "6px";
    note.style.fontSize = "0.9em";
    note.style.lineHeight = "1.4";
    note.style.opacity = "0.85";
    note.style.marginTop = "12px";
    note.style.marginBottom = "12px";
  }

  /**
   * Render action buttons (cancel and approve)
   */
  protected renderActionButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "20px";

    const cancelBtn = buttonContainer.createEl("button", { text: this.getCancelText() });
    this.styleCancelButton(cancelBtn);
    cancelBtn.onclick = () => {
      this.result = this.buildCancelledResult();
      this.resolveModalPromise(this.result);
      this.close();
    };

    const approveBtn = buttonContainer.createEl("button", { text: this.getApproveText() });
    this.styleApproveButton(approveBtn);
    approveBtn.onclick = () => {
      this.result = this.buildApprovedResult();
      this.resolveModalPromise(this.result);
      this.close();
    };
  }

  /**
   * Style a secondary button (select all, deselect all)
   */
  protected styleSecondaryButton(button: HTMLButtonElement): void {
    button.style.padding = "6px 12px";
    button.style.borderRadius = "4px";
    button.style.border = "1px solid var(--background-modifier-border)";
    button.style.backgroundColor = "transparent";
    button.style.cursor = "pointer";
    button.style.fontSize = "0.9em";
  }

  /**
   * Style cancel button
   */
  protected styleCancelButton(button: HTMLButtonElement): void {
    button.style.padding = "8px 16px";
    button.style.borderRadius = "4px";
    button.style.border = "1px solid var(--background-modifier-border)";
    button.style.backgroundColor = "transparent";
    button.style.cursor = "pointer";
  }

  /**
   * Style approve button
   */
  protected styleApproveButton(button: HTMLButtonElement): void {
    button.style.padding = "8px 16px";
    button.style.borderRadius = "4px";
    button.style.border = "none";
    button.style.backgroundColor = "var(--interactive-accent)";
    button.style.color = "var(--text-on-accent)";
    button.style.cursor = "pointer";
    button.style.fontWeight = "500";
  }

  /**
   * Wait for user decision
   */
  waitForResult(): Promise<TDecision> {
    return this.modalPromise;
  }

  /**
   * Clean up when modal closes
   */
  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();

    if (!this.result) {
      this.resolveModalPromise(this.buildCancelledResult());
    }
  }
}
