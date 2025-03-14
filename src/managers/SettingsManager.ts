import { Plugin } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { ChatGPT_MDSettingsTab } from "../Views/ChatGPT_MDSettingsTab";

/**
 * Handles loading and saving of plugin settings
 */
export class SettingsManager {
  private readonly plugin: Plugin;
  private settings: ChatGPT_MDSettings;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = structuredClone(DEFAULT_SETTINGS);
  }

  /**
   * Load settings from plugin data
   * @returns Promise resolving to the current settings
   */
  async loadSettings(): Promise<ChatGPT_MDSettings> {
    const loadedData = await this.plugin.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...loadedData };

    return this.settings;
  }

  /**
   * Save settings to plugin data
   */
  async saveSettings(): Promise<void> {
    await this.plugin.saveData(this.settings);
  }

  /**
   * Update settings with new values
   * @param newSettings Partial settings to merge with existing settings
   */
  updateSettings(newSettings: Partial<ChatGPT_MDSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Add settings tab to the plugin
   */
  async addSettingTab(): Promise<void> {
    const settings: ChatGPT_MDSettings = await this.loadSettings();

    this.plugin.addSettingTab(
      new ChatGPT_MDSettingsTab(this.plugin.app, this.plugin, {
        settings,
        saveSettings: this.saveSettings.bind(this),
      })
    );
  }
}
