import { App, normalizePath, Notice, SuggestModal, TFile, TFolder } from "obsidian";

import { ChatGPT_MDSettings } from "src/Models/Config";

interface ChatTemplate {
  title: string;
  file: TFile;
}

export class ChatTemplatesSuggestModal extends SuggestModal<ChatTemplate> {
  settings: ChatGPT_MDSettings;
  titleDate: string;

  constructor(app: App, settings: ChatGPT_MDSettings, titleDate: string) {
    super(app);
    this.settings = settings;
    this.titleDate = titleDate;
  }

  getFilesInChatFolder(): TFile[] {
    const folder = this.app.vault.getAbstractFileByPath(this.settings.chatTemplateFolder) as TFolder;
    if (folder != null) {
      return folder.children as TFile[];
    } else {
      new Notice(`Error getting folder: ${this.settings.chatTemplateFolder}`);
      throw new Error(`Error getting folder: ${this.settings.chatTemplateFolder}`);
    }
  }

  // Returns all available suggestions.
  getSuggestions(query: string): ChatTemplate[] {
    const chatTemplateFiles = this.getFilesInChatFolder();

    if (query == "") {
      return chatTemplateFiles.map((file) => {
        return {
          title: file.basename,
          file: file,
        };
      });
    }

    return chatTemplateFiles
      .filter((file) => {
        return file.basename.toLowerCase().includes(query.toLowerCase());
      })
      .map((file) => {
        return {
          title: file.basename,
          file: file,
        };
      });
  }

  // Renders each suggestion item.
  renderSuggestion(template: ChatTemplate, el: HTMLElement) {
    el.createEl("div", { text: template.title });
  }

  // Perform action on the selected suggestion.
  async onChooseSuggestion(template: ChatTemplate, evt: MouseEvent | KeyboardEvent) {
    new Notice(`Selected ${template.title}`);
    const templateText = await this.app.vault.read(template.file);
    // use template text to create new file in chat folder

    const newFileName = `${this.titleDate} ${template.title}`;
    let newFilePath = normalizePath(`${this.settings.chatFolder}/${newFileName}.md`);

    let i = 1;
    while (await this.app.vault.adapter.exists(newFilePath)) {
      newFilePath = normalizePath(`${this.settings.chatFolder}/${newFileName} (${i}).md`);
      i++;
    }

    try {
      const file = await this.app.vault.create(newFilePath, templateText);
      // open new file
      await this.app.workspace.openLinkText(file.basename, "", true);
    } catch (error) {
      console.error(error);
    }
  }
}
