import { App, Modal, Setting } from "obsidian";

/**
 * Modal for prompting the user for a search query
 */
export class SearchPromptModal extends Modal {
  private query: string = "";
  private onSubmit: (query: string) => void;

  constructor(app: App, onSubmit: (query: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Search Vault" });

    new Setting(contentEl)
      .setName("Search Query")
      .setDesc("Enter a query to search for semantically similar content in your vault")
      .addText((text) =>
        text
          .setPlaceholder("Enter your search query here")
          .setValue(this.query)
          .onChange((value) => {
            this.query = value;
          })
      );

    const buttonContainer = contentEl.createDiv();
    buttonContainer.addClass("search-prompt-buttons");

    const submitButton = buttonContainer.createEl("button", { text: "Search" });
    submitButton.addEventListener("click", () => {
      this.close();
      if (this.query && this.query.trim() !== "") {
        this.onSubmit(this.query);
      }
    });

    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    // Add CSS to style buttons
    contentEl.createEl("style", {
      text: `
        .search-prompt-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
        .search-prompt-buttons button {
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
        }
      `,
    });

    // Auto focus the text input
    const inputEl = contentEl.querySelector("input");
    if (inputEl) {
      inputEl.focus();
    }

    // Handle pressing Enter to submit
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.close();
        if (this.query && this.query.trim() !== "") {
          this.onSubmit(this.query);
        }
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
