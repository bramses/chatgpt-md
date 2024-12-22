import { App, PluginSettingTab, Setting } from "obsidian";
import ChatGPT_MD from "../main";

export class SettingsView extends PluginSettingTab {
  plugin: ChatGPT_MD;

  constructor(app: App, plugin: ChatGPT_MD) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "ChatGPT MD Settings" });

    this.createSettingsUI(containerEl);
  }

  createSettingsUI(containerEl: HTMLElement) {
    new Setting(containerEl)
      .setName("OpenAI API Key")
      .setDesc("Enter your OpenAI API key")
      .addText((text) =>
        text
          .setPlaceholder("Enter API Key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default Chat Frontmatter")
      .setDesc("Default frontmatter for new chat files.")
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter default frontmatter")
          .setValue(this.plugin.settings.defaultChatFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.defaultChatFrontmatter = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Stream")
      .setDesc("Enable stream mode by default")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.stream).onChange(async (value) => {
          this.plugin.settings.stream = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Chat Folder")
      .setDesc("Path to the folder for saving chat files")
      .addText((text) =>
        text
          .setPlaceholder("Enter folder path")
          .setValue(this.plugin.settings.chatFolder)
          .onChange(async (value) => {
            this.plugin.settings.chatFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Chat Template Folder")
      .setDesc("Path to folder for chat file templates")
      .addText((text) =>
        text
          .setPlaceholder("Enter template folder path")
          .setValue(this.plugin.settings.chatTemplateFolder)
          .onChange(async (value) => {
            this.plugin.settings.chatTemplateFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Generate at Cursor")
      .setDesc("Generate text at cursor instead of end of file")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.generateAtCursor)
          .onChange(async (value) => {
            this.plugin.settings.generateAtCursor = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Automatically Infer Title")
      .setDesc("Automatically infer title after 4 messages have been exchanged")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoInferTitle)
          .onChange(async (value) => {
            this.plugin.settings.autoInferTitle = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Date Format")
      .setDesc(
        "Set the date format for new chat files. Examples: YYYYMMDD, YYYY-MM-DD, YYYYMMDDhhmmss, etc."
      )
      .addText((text) =>
        text
          .setPlaceholder("YYYYMMDD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange(async (value) => {
            this.plugin.settings.dateFormat = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Heading Level")
      .setDesc("Select the heading level for inserted sections.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "0": "None",
            "1": "H1",
            "2": "H2",
            "3": "H3",
            "4": "H4",
            "5": "H5",
            "6": "H6",
          })
          .setValue(this.plugin.settings.headingLevel.toString())
          .onChange(async (value) => {
            this.plugin.settings.headingLevel = parseInt(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Infer Title Language")
      .setDesc("Select the language to use for inferring titles.")
      .addDropdown((dropdown) => {
        const languages = {
          English: "English",
          Japanese: "Japanese",
          Spanish: "Spanish",
          French: "French",
          German: "German",
          Chinese: "Chinese",
          Korean: "Korean",
          Italian: "Italian",
          Russian: "Russian",
        };
        dropdown.addOptions(languages);
        dropdown.setValue(this.plugin.settings.inferTitleLanguage);
        dropdown.onChange(async (value) => {
          this.plugin.settings.inferTitleLanguage = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
