import { ChatGPT_MDSettings } from "src/Models/Config";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
} from "./DefaultConfigs";
import { PLUGIN_SYSTEM_MESSAGE } from "src/Constants";

// Original plugin system message for migration comparison
const ORIGINAL_PLUGIN_SYSTEM_MESSAGE = `You are an AI assistant integrated into Obsidian through the ChatGPT MD plugin. You are helping a user who is working within their Obsidian vault - a personal knowledge management system where they store notes, thoughts, and information in Markdown format.

Key context:
- The user is writing in Markdown format within Obsidian
- They may reference other notes in their vault using [[wiki links]] or standard [markdown links](url)
- Your responses will be inserted directly into their Markdown document
- Be concise but helpful, and format your responses appropriately for Markdown
- If you provide code examples, use proper markdown code blocks with language specification
- When suggesting organizational strategies, consider that this is within a personal knowledge management context
- The user may be taking notes, brainstorming, writing, researching, or organizing information

Code block formatting requirements:
- Code blocks must start and end with exactly 3 backticks (\`\`\`) on a new line
- There should be no whitespace before the opening or closing backticks
- The language name should be specified immediately after the opening backticks
- The actual code should start on a new line after the language specification
- Example format:
\`\`\`javascript
console.log("Hello World");
\`\`\`

Inline code formatting requirements:
- Use single backticks (\`) for inline code references like filenames (e.g., \`example.md\`), variable names (e.g., \`myVariable\`), or short code snippets referenced within a paragraph.
- Always ensure that single backticks are properly closed to avoid breaking Markdown rendering. For example, use \`code\` not \`code.

Table formatting requirements:
- Use standard Markdown table syntax.
- Tables should NOT be wrapped in code blocks.

Respond naturally and helpfully while being mindful of this Obsidian/note-taking context.`;

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
 * Handles all settings migrations for the ChatGPT MD plugin
 */
export class SettingsMigrationService {
  /**
   * Run all necessary migrations
   */
  async migrateSettings(
    settings: ChatGPT_MDSettings,
    updateSettings: (newSettings: Partial<ChatGPT_MDSettings>) => void
  ): Promise<boolean> {
    let needsUpdate = false;

    // 1. Migrate URL settings
    needsUpdate = (await this.migrateUrlSettings(settings, updateSettings)) || needsUpdate;

    // 2. Migrate to new frontmatter structure
    needsUpdate = (await this.migrateFrontmatterSettings(settings, updateSettings)) || needsUpdate;

    // 3. Migrate plugin system message to concise version
    needsUpdate = (await this.migratePluginSystemMessage(settings, updateSettings)) || needsUpdate;

    if (needsUpdate) {
      console.log("[ChatGPT MD] Settings migration completed");
    }

    return needsUpdate;
  }

  /**
   * Migrate URL settings (existing functionality)
   */
  private async migrateUrlSettings(
    settings: ChatGPT_MDSettings,
    updateSettings: (newSettings: Partial<ChatGPT_MDSettings>) => void
  ): Promise<boolean> {
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
      const currentValue = settings[settingKey] as string | undefined;

      if (currentValue && migration.pattern.test(currentValue)) {
        updateSettings({
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
  private async migrateFrontmatterSettings(
    settings: ChatGPT_MDSettings,
    updateSettings: (newSettings: Partial<ChatGPT_MDSettings>) => void
  ): Promise<boolean> {
    // Check if migration is needed (if any of the new fields are missing)
    const hasNewStructure =
      settings.hasOwnProperty("openaiDefaultModel") || settings.hasOwnProperty("anthropicDefaultModel");

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
    updateSettings({
      ...newProviderSettings,
    } as Partial<ChatGPT_MDSettings>);

    console.log("[ChatGPT MD] Migrated frontmatter settings to new structure");
    return true;
  }

  /**
   * Migrate plugin system message to concise version (v2.8.1)
   * Only migrates if user has the exact original message (hasn't customized it)
   */
  private async migratePluginSystemMessage(
    settings: ChatGPT_MDSettings,
    updateSettings: (newSettings: Partial<ChatGPT_MDSettings>) => void
  ): Promise<boolean> {
    // Check if user has the exact original plugin system message (unchanged from default)
    // Trim whitespace to avoid issues with formatting differences
    const currentMessage = settings.pluginSystemMessage?.trim();
    const originalMessage = ORIGINAL_PLUGIN_SYSTEM_MESSAGE.trim();

    if (currentMessage !== originalMessage) {
      console.log("[ChatGPT MD] Plugin system message has been customized by user, skipping migration");
      return false;
    }

    console.log("[ChatGPT MD] Migrating plugin system message to concise version (v2.8.1)");

    // Update to the new concise version
    updateSettings({
      pluginSystemMessage: PLUGIN_SYSTEM_MESSAGE,
    } as Partial<ChatGPT_MDSettings>);

    console.log("[ChatGPT MD] Plugin system message migrated to concise version");
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
      "model: gpt-4": `model: \${openaiDefaultModel}`,
      "model: gpt-4o": `model: \${openaiDefaultModel}`,
      "model: claude-3": `model: \${anthropicDefaultModel}`,
      "model: gemini-pro": `model: \${geminiDefaultModel}`,
      "temperature: 1": `temperature: \${providerDefaultTemperature}`,
      "max_tokens: 300": `max_tokens: \${providerDefaultMaxTokens}`,
    };

    let migratedString = frontmatterString;

    // Apply mappings
    for (const [oldParam, newParam] of Object.entries(parameterMappings)) {
      migratedString = migratedString.replace(new RegExp(oldParam, "g"), newParam);
    }

    // Add a comment about the migration
    if (migratedString !== frontmatterString) {
      migratedString = `# Migrated frontmatter - consider using provider-specific defaults in settings\n${migratedString}`;
    }

    return migratedString;
  }
}
