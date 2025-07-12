import { Plugin } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { ChatGPT_MDSettingsTab } from "../Views/ChatGPT_MDSettingsTab";
import { NotificationService } from "./NotificationService";
import { ErrorService } from "./ErrorService";
import { DEFAULT_OPENAI_CONFIG } from "./OpenAiService";
import { DEFAULT_ANTHROPIC_CONFIG } from "./AnthropicService";
import { DEFAULT_GEMINI_CONFIG } from "./GeminiService";
import { DEFAULT_OPENROUTER_CONFIG } from "./OpenRouterService";
import { DEFAULT_LMSTUDIO_CONFIG } from "./LmStudioService";

// Define interface for migration data
interface SettingsMigration {
  setting: string;
  pattern: RegExp;
  replacement: string;
  description: string;
  introducedIn: string; // For documentation purposes only
}

// Define interface for frontmatter migration data
interface _FrontmatterMigration {
  fromKey: string;
  toKey: string;
  description: string;
  introducedIn: string;
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
    let needsUpdate = false;

    // 1. Migrate URL settings (existing migrations)
    needsUpdate = await this.migrateUrlSettings() || needsUpdate;

    // 2. Migrate to new frontmatter structure
    needsUpdate = await this.migrateFrontmatterSettings() || needsUpdate;

    // Save settings if any changes were made
    if (needsUpdate) {
      await this.saveSettings();
      console.log("[ChatGPT MD] Settings migration completed");
    }
  }

  /**
   * Migrate URL settings (existing functionality)
   */
  private async migrateUrlSettings(): Promise<boolean> {
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

    for (const migration of settingsMigrations) {
      const settingKey = migration.setting as keyof ChatGPT_MDSettings;
      const currentValue = this.settings[settingKey] as string | undefined;

      if (currentValue && migration.pattern.test(currentValue)) {
        this.updateSettings({
          [settingKey]: currentValue.replace(migration.pattern, migration.replacement),
        } as Partial<ChatGPT_MDSettings>);

        console.log(`[ChatGPT MD] Migration (${migration.introducedIn}): ${migration.description}`);
        needsUpdate = true;
      }
    }

    return needsUpdate;
  }

  /**
   * Migrate to new frontmatter settings structure
   */
  private async migrateFrontmatterSettings(): Promise<boolean> {

    // Check if migration is needed (if any of the new fields are missing)
    const hasNewStructure = this.settings.hasOwnProperty('openaiDefaultModel') ||
                           this.settings.hasOwnProperty('anthropicDefaultModel');

    if (hasNewStructure) {
      console.log("[ChatGPT MD] New frontmatter structure already present, skipping migration");
      return false;
    }

    console.log("[ChatGPT MD] Migrating to new frontmatter settings structure (v2.7.0)");

    // Migrate provider-specific settings from their config defaults
    // Use the actual service config values as the single source of truth
    const newProviderSettings = {
      // OpenAI defaults
      openaiDefaultModel: DEFAULT_OPENAI_CONFIG.model,
      openaiDefaultTemperature: DEFAULT_OPENAI_CONFIG.temperature,
      openaiDefaultTopP: DEFAULT_OPENAI_CONFIG.top_p,
      openaiDefaultMaxTokens: DEFAULT_OPENAI_CONFIG.max_tokens,
      openaiDefaultPresencePenalty: DEFAULT_OPENAI_CONFIG.presence_penalty,
      openaiDefaultFrequencyPenalty: DEFAULT_OPENAI_CONFIG.frequency_penalty,

      // Anthropic defaults
      anthropicDefaultModel: DEFAULT_ANTHROPIC_CONFIG.model,
      anthropicDefaultTemperature: DEFAULT_ANTHROPIC_CONFIG.temperature,
      anthropicDefaultMaxTokens: DEFAULT_ANTHROPIC_CONFIG.max_tokens,

      // Gemini defaults
      geminiDefaultModel: DEFAULT_GEMINI_CONFIG.model,
      geminiDefaultTemperature: DEFAULT_GEMINI_CONFIG.temperature,
      geminiDefaultTopP: DEFAULT_GEMINI_CONFIG.top_p,
      geminiDefaultMaxTokens: DEFAULT_GEMINI_CONFIG.max_tokens,

      // OpenRouter defaults
      openrouterDefaultModel: DEFAULT_OPENROUTER_CONFIG.model,
      openrouterDefaultTemperature: DEFAULT_OPENROUTER_CONFIG.temperature,
      openrouterDefaultTopP: DEFAULT_OPENROUTER_CONFIG.top_p,
      openrouterDefaultMaxTokens: DEFAULT_OPENROUTER_CONFIG.max_tokens,
      openrouterDefaultPresencePenalty: DEFAULT_OPENROUTER_CONFIG.presence_penalty,
      openrouterDefaultFrequencyPenalty: DEFAULT_OPENROUTER_CONFIG.frequency_penalty,

      // Ollama defaults (no default model - user must configure)
      ollamaDefaultTemperature: 0.7, // Ollama config doesn't have temperature
      ollamaDefaultTopP: 1, // Ollama config doesn't have top_p

      // LM Studio defaults (no default model - user must configure)
      lmstudioDefaultTemperature: DEFAULT_LMSTUDIO_CONFIG.temperature,
      lmstudioDefaultTopP: DEFAULT_LMSTUDIO_CONFIG.top_p,
      lmstudioDefaultPresencePenalty: DEFAULT_LMSTUDIO_CONFIG.presence_penalty,
      lmstudioDefaultFrequencyPenalty: DEFAULT_LMSTUDIO_CONFIG.frequency_penalty,
    };

    // Apply all new settings
    this.updateSettings({
      ...newProviderSettings,
    } as Partial<ChatGPT_MDSettings>);

    console.log("[ChatGPT MD] Migrated frontmatter settings to new structure");
    return true;
  }

  /**
   * Migrate user's existing frontmatter strings from old format to new format
   * This helps users who have customized their defaultChatFrontmatter
   */
  migrateFrontmatterString(frontmatterString: string): string {
    // Define mappings for common old parameters to new structure
    const parameterMappings: Record<string, string> = {
      // These would now come from provider-specific settings instead of hardcoded values
      'model: gpt-4': `model: \${openaiDefaultModel}`,
      'model: gpt-4o': `model: \${openaiDefaultModel}`,
      'model: claude-3': `model: \${anthropicDefaultModel}`,
      'model: gemini-pro': `model: \${geminiDefaultModel}`,
      'temperature: 1': `temperature: \${providerDefaultTemperature}`,
      'max_tokens: 300': `max_tokens: \${providerDefaultMaxTokens}`,
    };

    let migratedString = frontmatterString;

    // Apply mappings
    for (const [oldParam, newParam] of Object.entries(parameterMappings)) {
      migratedString = migratedString.replace(new RegExp(oldParam, 'g'), newParam);
    }

    // Add a comment about the migration
    if (migratedString !== frontmatterString) {
      migratedString = `# Migrated frontmatter - consider using provider-specific defaults in settings\n${migratedString}`;
    }

    return migratedString;
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
