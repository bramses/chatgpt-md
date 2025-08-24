import { Plugin } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { ChatGPT_MDSettingsTab } from "../Views/ChatGPT_MDSettingsTab";
import { NotificationService } from "./NotificationService";
import { ErrorService } from "./ErrorService";
import { SettingsMigrationService } from "./SettingsMigration";

/**
 * Manages plugin settings with persistence
 */
export class SettingsService {
  private settings: ChatGPT_MDSettings;
  private migrationService: SettingsMigrationService;

  constructor(
    private readonly plugin: Plugin,
    private readonly notificationService: NotificationService = new NotificationService(),
    private readonly errorService: ErrorService = new ErrorService(new NotificationService())
  ) {
    this.migrationService = new SettingsMigrationService();
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
    const needsUpdate = await this.migrationService.migrateSettings(this.settings, this.updateSettings.bind(this));

    // Save settings if any changes were made
    if (needsUpdate) {
      await this.saveSettings();
    }
  }

  /**
   * Migrate user's existing frontmatter strings from old format to new format
   * This helps users who have customized their defaultChatFrontmatter
   */
  migrateFrontmatterString(frontmatterString: string): string {
    return this.migrationService.migrateFrontmatterString(frontmatterString);
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
