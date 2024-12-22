import { Modal, App, Setting } from "obsidian";

type TemplateSelectedCallback = (template: string | null) => void;

export class TemplateSelectionDialog extends Modal {
  private templates: string[];
  private callback: TemplateSelectedCallback;

  constructor(
    app: App,
    templates: string[],
    callback: TemplateSelectedCallback
  ) {
    super(app);
    this.templates = templates;
    this.callback = callback;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Select a Template" });

    this.templates.forEach((template) => {
      new Setting(contentEl).addButton((button) =>
        button.setButtonText(template).onClick(() => {
          this.callback(template);
          this.close();
        })
      );
    });

    // Cancel button
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Cancel")
        .setCta()
        .onClick(() => {
          this.callback(null);
          this.close();
        })
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
