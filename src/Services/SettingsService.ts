import { Plugin } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { ChatGPT_MDSettingsTab } from "../Views/ChatGPT_MDSettingsTab";
import { NotificationService } from "./NotificationService";
import { ErrorService } from "./ErrorService";

// Define interface for migration data
interface SettingsMigration {
  setting: string;
  pattern: RegExp;
  replacement: string;
  description: string;
  introducedIn: string; // For documentation purposes only
}

/**
 * Manages plugin settings with persistence
 */
export class SettingsService {
  private settings: ChatGPT_MDSettings;

  constructor(
    private readonly plugin: Plugin,
    private readonly notificationService: NotificationService = new NotificationService(),
    private readonly errorService: ErrorService = new ErrorService(new NotificationService())
  ) {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.loadSettings().catch((error) => this.notificationService.showError("Failed to load settings"));
  }

  /**
   * Get current settings
   */
  getSettings(): ChatGPT_MDSettings {
    return this.settings;
  }

  /**
   * Migrate settings from older versions
   */
  async migrateSettings(): Promise<void> {
    // Define migrations as an array of objects with version information
    const settingsMigrations: SettingsMigration[] = [
      {
        setting: "ollamaUrl",
        pattern: /\/api\/$/,
        replacement: "",
        description: "Removing trailing /api/ from Ollama URL",
        introducedIn: "2.1.3",
      },
      {
        setting: "openrouterUrl",
        pattern: /\/api\/$/,
        replacement: "",
        description: "Removing trailing /api/ from OpenRouter URL",
        introducedIn: "2.1.3",
      },
      {
        setting: "openaiUrl",
        pattern: /\/$/,
        replacement: "",
        description: "Removing trailing slash from OpenAI URL",
        introducedIn: "2.1.3",
      },
    ];

    let needsUpdate = false;

    // Execute each migration
    for (const migration of settingsMigrations) {
      const settingKey = migration.setting as keyof ChatGPT_MDSettings;
      const currentValue = this.settings[settingKey] as string | undefined;

      if (currentValue && migration.pattern.test(currentValue)) {
        // Use updateSettings for type safety
        this.updateSettings({
          [settingKey]: currentValue.replace(migration.pattern, migration.replacement),
        } as Partial<ChatGPT_MDSettings>);

        console.log(`[ChatGPT MD] Migration (${migration.introducedIn}): ${migration.description}`);
        needsUpdate = true;
      }
    }

    // Save settings if any changes were made
    if (needsUpdate) {
      await this.saveSettings();
      console.log("[ChatGPT MD] Migrated settings");
    }
  }

  /**
   * Load settings from plugin data
   */
  async loadSettings(): Promise<ChatGPT_MDSettings> {
    const loadedData = await this.plugin.loadData();
    Object.assign(this.settings, DEFAULT_SETTINGS, loadedData);
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
   */
  updateSettings(newSettings: Partial<ChatGPT_MDSettings>): void {
    Object.assign(this.settings, newSettings);
  }

  /**
   * Add settings tab to the plugin
   */
  async addSettingTab(): Promise<void> {
    // Load settings and run migrations if needed
    await this.loadSettings();

    // Create the settings tab with the current settings
    this.plugin.addSettingTab(
      new ChatGPT_MDSettingsTab(this.plugin.app, this.plugin, {
        settings: this.settings,
        saveSettings: this.saveSettings.bind(this),
      })
    );
  }
}
