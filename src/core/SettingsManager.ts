import { Plugin } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";

/**
 * Handles loading and saving of plugin settings
 */
export class SettingsManager {
  private plugin: Plugin;
  private settings: ChatGPT_MDSettings;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
  }

  /**
   * Load settings from plugin data
   */
  async loadSettings(): Promise<ChatGPT_MDSettings> {
    const loadedData = await this.plugin.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    return this.settings;
  }

  /**
   * Save settings to plugin data
   */
  async saveSettings(): Promise<void> {
    await this.plugin.saveData(this.settings);
  }

  /**
   * Get the current settings
   */
  getSettings(): ChatGPT_MDSettings {
    return this.settings;
  }

  /**
   * Update settings with new values
   */
  updateSettings(newSettings: Partial<ChatGPT_MDSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }
}
