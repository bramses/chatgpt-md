import { Plugin } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "../../Models/Config";
import { ChatGPT_MDSettingsTab } from "../../Views/ChatGPT_MDSettingsTab";

/**
 * SettingsManager - Simplified settings management
 *
 * Focuses solely on settings persistence and migration without external dependencies.
 * Removes unnecessary coupling to notification and error services.
 */
export class SettingsManager {
  private settings: ChatGPT_MDSettings;

  constructor(private readonly plugin: Plugin) {
    this.settings = structuredClone(DEFAULT_SETTINGS);
  }

  /**
   * Get current settings
   */
  getSettings(): ChatGPT_MDSettings {
    return this.settings;
  }

  /**
   * Update a specific setting
   */
  updateSetting<K extends keyof ChatGPT_MDSettings>(key: K, value: ChatGPT_MDSettings[K]): void {
    this.settings[key] = value;
  }

  /**
   * Update multiple settings at once
   */
  updateSettings(newSettings: Partial<ChatGPT_MDSettings>): void {
    Object.assign(this.settings, newSettings);
  }

  /**
   * Load settings from plugin data
   */
  async loadSettings(): Promise<void> {
    try {
      const loadedData = await this.plugin.loadData();
      Object.assign(this.settings, DEFAULT_SETTINGS, loadedData);
    } catch (error) {
      console.error("[ChatGPT MD] Failed to load settings:", error);
      // Use defaults on failure
    }
  }

  /**
   * Save settings to plugin data
   */
  async saveSettings(): Promise<void> {
    try {
      await this.plugin.saveData(this.settings);
    } catch (error) {
      console.error("[ChatGPT MD] Failed to save settings:", error);
      throw error;
    }
  }

  /**
   * Migrate settings from older versions
   */
  async migrateSettings(): Promise<void> {
    interface SettingsMigration {
      setting: keyof ChatGPT_MDSettings;
      pattern: RegExp;
      replacement: string;
      description: string;
    }

    const migrations: SettingsMigration[] = [
      {
        setting: "ollamaUrl",
        pattern: /\/api\/$/,
        replacement: "",
        description: "Removing trailing /api/ from Ollama URL",
      },
      {
        setting: "openrouterUrl",
        pattern: /\/api\/$/,
        replacement: "",
        description: "Removing trailing /api/ from OpenRouter URL",
      },
      {
        setting: "openaiUrl",
        pattern: /\/$/,
        replacement: "",
        description: "Removing trailing slash from OpenAI URL",
      },
    ];

    let needsUpdate = false;

    for (const migration of migrations) {
      const settingKey = migration.setting as keyof ChatGPT_MDSettings;
      const currentValue = this.settings[settingKey] as string | undefined;

      if (currentValue && migration.pattern.test(currentValue)) {
        this.updateSettings({
          [settingKey]: currentValue.replace(migration.pattern, migration.replacement),
        } as Partial<ChatGPT_MDSettings>);

        console.log(`[ChatGPT MD] Migration: ${migration.description}`);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      await this.saveSettings();
      console.log("[ChatGPT MD] Settings migration completed");
    }
  }

  /**
   * Initialize settings (load and migrate)
   */
  async initialize(): Promise<void> {
    await this.loadSettings();
    await this.migrateSettings();
  }

  /**
   * Add settings tab to the plugin
   */
  addSettingTab(): void {
    this.plugin.addSettingTab(
      new ChatGPT_MDSettingsTab(this.plugin.app, this.plugin, {
        settings: this.settings,
        saveSettings: this.saveSettings.bind(this),
      })
    );
  }
}
