import { Editor, MarkdownView, Plugin, TFile } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS, MergedFrontmatterConfig } from "src/Models/Config";
import { ChatGPT_MDSettingsTab } from "../Views/ChatGPT_MDSettingsTab";
import { NotificationService } from "./NotificationService";
import { ErrorService } from "./ErrorService";
import { SettingsMigrationService } from "./SettingsMigration";
import { FrontmatterManager } from "./FrontmatterManager";
import { parseSettingsFrontmatter, objectToYamlFrontmatter } from "src/Utilities/YamlHelpers";
import { getDefaultConfigForService } from "src/Utilities/FrontmatterHelpers";
import { aiProviderFromKeys, aiProviderFromUrl } from "src/Utilities/ProviderHelpers";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  AI_SERVICE_ZAI,
} from "src/Constants";

/**
 * Provider-specific frontmatter field mapping
 */
const PROVIDER_FRONTMATTER_FIELDS: Record<
  string,
  (settings: ChatGPT_MDSettings) => Record<string, unknown>
> = {
  [AI_SERVICE_OPENAI]: (s) => ({
    model: s.openaiDefaultModel,
    temperature: s.openaiDefaultTemperature,
    top_p: s.openaiDefaultTopP,
    max_tokens: s.openaiDefaultMaxTokens,
    presence_penalty: s.openaiDefaultPresencePenalty,
    frequency_penalty: s.openaiDefaultFrequencyPenalty,
  }),
  [AI_SERVICE_OLLAMA]: (s) => ({
    url: s.ollamaUrl,
    temperature: s.ollamaDefaultTemperature,
    top_p: s.ollamaDefaultTopP,
  }),
  [AI_SERVICE_OPENROUTER]: (s) => ({
    model: s.openrouterDefaultModel,
    temperature: s.openrouterDefaultTemperature,
    top_p: s.openrouterDefaultTopP,
    max_tokens: s.openrouterDefaultMaxTokens,
    presence_penalty: s.openrouterDefaultPresencePenalty,
    frequency_penalty: s.openrouterDefaultFrequencyPenalty,
  }),
  [AI_SERVICE_LMSTUDIO]: (s) => ({
    url: s.lmstudioUrl,
    temperature: s.lmstudioDefaultTemperature,
    top_p: s.lmstudioDefaultTopP,
    presence_penalty: s.lmstudioDefaultPresencePenalty,
    frequency_penalty: s.lmstudioDefaultFrequencyPenalty,
  }),
  [AI_SERVICE_ANTHROPIC]: (s) => ({
    model: s.anthropicDefaultModel,
    url: s.anthropicUrl,
    temperature: s.anthropicDefaultTemperature,
    max_tokens: s.anthropicDefaultMaxTokens,
  }),
  [AI_SERVICE_GEMINI]: (s) => ({
    model: s.geminiDefaultModel,
    url: s.geminiUrl,
    temperature: s.geminiDefaultTemperature,
    top_p: s.geminiDefaultTopP,
    max_tokens: s.geminiDefaultMaxTokens,
  }),
  [AI_SERVICE_ZAI]: (s) => ({
    model: s.zaiDefaultModel,
    url: s.zaiUrl,
    temperature: s.zaiDefaultTemperature,
    max_tokens: s.zaiDefaultMaxTokens,
  }),
};

/**
 * Manages plugin settings with persistence
 * Now includes frontmatter operations (merged from FrontmatterService)
 */
export class SettingsService {
  private settings: ChatGPT_MDSettings;
  private migrationService: SettingsMigrationService;

  constructor(
    private readonly plugin: Plugin,
    private readonly frontmatterManager: FrontmatterManager,
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

  // ========== Frontmatter Operations (merged from FrontmatterService) ==========

  /**
   * Get frontmatter from a markdown view using FrontmatterManager
   */
  async getFrontmatter(view: MarkdownView): Promise<MergedFrontmatterConfig> {
    let frontmatter: Record<string, unknown> = {};

    // Use FrontmatterManager to get frontmatter
    if (view.file) {
      const fileFrontmatter = await this.frontmatterManager.readFrontmatter(view.file);
      if (fileFrontmatter) {
        frontmatter = { ...fileFrontmatter };
      }
    }

    // Parse default frontmatter from settings
    const defaultFrontmatter = this.settings.defaultChatFrontmatter
      ? parseSettingsFrontmatter(this.settings.defaultChatFrontmatter)
      : {};

    // Merge configurations with proper priority order
    // Priority: defaultFrontmatter < settings < frontmatter
    const merged: Record<string, unknown> & Partial<MergedFrontmatterConfig> = {
      ...defaultFrontmatter,
      ...this.settings,
      ...frontmatter,
    };

    // Determine AI service
    const aiService =
      (merged.aiService as string | undefined) ||
      aiProviderFromUrl(merged.url as string | undefined, merged.model as string | undefined) ||
      aiProviderFromKeys(merged as Record<string, unknown>) ||
      AI_SERVICE_OPENAI;

    // Get default config for the determined service
    const defaultConfig = getDefaultConfigForService(aiService);

    // Return final configuration with everything merged
    // Priority order: defaultConfig < defaultFrontmatter < settings < frontmatter
    // This ensures global settings override template defaults, but note frontmatter overrides everything
    const finalConfig = {
      ...defaultConfig,
      ...defaultFrontmatter,
      ...this.settings,
      ...frontmatter,
      aiService,
    };

    // Cast to MergedFrontmatterConfig - at this point we have all necessary fields from defaults and merging
    return finalConfig as unknown as MergedFrontmatterConfig;
  }

  /**
   * Update a field in the frontmatter of a file using FrontmatterManager
   * @param editor The editor instance
   * @param key The key to update
   * @param value The new value
   */
  async updateFrontmatterField(editor: Editor, key: string, value: unknown): Promise<void> {
    // Get the active file
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView || !activeView.file) {
      console.error("[ChatGPT MD] No active file found for frontmatter update");
      return;
    }

    const file: TFile = activeView.file;

    try {
      // Use FrontmatterManager to update the field
      await this.frontmatterManager.updateFrontmatterField(file, key, value);
    } catch (error) {
      console.error("[ChatGPT MD] Error updating frontmatter:", error);
      throw error;
    }
  }

  // objectToYamlFrontmatter moved to YamlHelpers.ts - using imported function

  /**
   * Generate frontmatter for a new chat
   */
  generateFrontmatter(additionalSettings: Record<string, unknown> = {}): string {
    // If default frontmatter exists in settings, use it as a base
    if (this.settings.defaultChatFrontmatter) {
      return this.handleExistingTemplate(additionalSettings);
    }

    // Generate frontmatter from scratch using data-driven approach
    const aiService = (additionalSettings.aiService as string) || AI_SERVICE_OPENAI;
    const getProviderFields = PROVIDER_FRONTMATTER_FIELDS[aiService];

    const frontmatterObj: Record<string, unknown> = {
      stream: this.settings.stream,
      ...additionalSettings,
      ...(getProviderFields ? getProviderFields(this.settings) : {}),
    };

    return objectToYamlFrontmatter(frontmatterObj);
  }

  private handleExistingTemplate(additionalSettings: Record<string, unknown>): string {
    if (Object.keys(additionalSettings).length > 0) {
      const defaultFrontmatter = parseSettingsFrontmatter(this.settings.defaultChatFrontmatter);
      const merged = { ...defaultFrontmatter, ...additionalSettings };
      return objectToYamlFrontmatter(merged);
    }
    return this.settings.defaultChatFrontmatter + "\n\n";
  }
}
