import { App, Editor, MarkdownView, TFile } from "obsidian";
import { parseSettingsFrontmatter } from "src/Utilities/TextHelpers";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import { DEFAULT_OLLAMA_CONFIG } from "src/Services/OllamaService";
import { DEFAULT_OPENROUTER_CONFIG } from "src/Services/OpenRouterService";
import { DEFAULT_LMSTUDIO_CONFIG } from "src/Services/LmStudioService";
import { DEFAULT_ANTHROPIC_CONFIG } from "src/Services/AnthropicService";
import { aiProviderFromKeys, aiProviderFromUrl } from "src/Services/AiService";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "src/Constants";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
import { AI_SERVICE_LMSTUDIO, AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";

/**
 * Service responsible for frontmatter parsing and generation
 */
export class FrontmatterService {
  constructor(
    private app: App,
    private frontmatterManager: FrontmatterManager
  ) {}

  /**
   * Get frontmatter from a markdown view using FrontmatterManager
   */
  async getFrontmatter(view: MarkdownView, settings: ChatGPT_MDSettings): Promise<any> {
    let frontmatter: Record<string, any> = {};

    // Use FrontmatterManager to get frontmatter
    if (view.file) {
      const fileFrontmatter = await this.frontmatterManager.readFrontmatter(view.file);
      if (fileFrontmatter) {
        frontmatter = { ...fileFrontmatter };
      }
    }

    // Parse default frontmatter from settings
    const defaultFrontmatter = settings.defaultChatFrontmatter
      ? parseSettingsFrontmatter(settings.defaultChatFrontmatter)
      : {};

    // Merge configurations with proper priority order
    const mergedConfig = { ...settings, ...defaultFrontmatter, ...frontmatter } as Record<string, any>;

    // Determine AI service
    const aiService =
      mergedConfig.aiService ||
      aiProviderFromUrl(mergedConfig.url, mergedConfig.model) ||
      aiProviderFromKeys(mergedConfig) ||
      AI_SERVICE_OPENAI;

    // Get default config for the determined service
    const serviceDefaults: Record<string, any> = {
      [AI_SERVICE_OPENAI]: DEFAULT_OPENAI_CONFIG,
      [AI_SERVICE_OLLAMA]: DEFAULT_OLLAMA_CONFIG,
      [AI_SERVICE_OPENROUTER]: DEFAULT_OPENROUTER_CONFIG,
      [AI_SERVICE_LMSTUDIO]: DEFAULT_LMSTUDIO_CONFIG,
      [AI_SERVICE_ANTHROPIC]: DEFAULT_ANTHROPIC_CONFIG,
    };
    const defaultConfig = serviceDefaults[aiService] || DEFAULT_OPENAI_CONFIG;

    // Return final configuration with everything merged
    return {
      ...defaultConfig,
      ...settings,
      ...defaultFrontmatter,
      ...frontmatter,
      aiService,
    };
  }

  /**
   * Update a field in the frontmatter of a file using FrontmatterManager
   * @param editor The editor instance
   * @param key The key to update
   * @param value The new value
   */
  async updateFrontmatterField(editor: Editor, key: string, value: any): Promise<void> {
    // Get the active file
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
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

  /**
   * Convert a JavaScript object to YAML frontmatter string
   * @param obj Object to convert to YAML
   * @returns YAML frontmatter string including delimiter markers
   */
  private objectToYamlFrontmatter(obj: Record<string, any>): string {
    // Convert to YAML
    const frontmatterLines = Object.entries(obj).map(([key, value]) => {
      if (value === null || value === undefined) {
        return `${key}:`;
      }
      if (typeof value === "string") {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    });

    return `---\n${frontmatterLines.join("\n")}\n---\n\n`;
  }

  /**
   * Generate frontmatter for a new chat
   */
  generateFrontmatter(settings: ChatGPT_MDSettings, additionalSettings: Record<string, any> = {}): string {
    // If default frontmatter exists in settings, use it as a base
    if (settings.defaultChatFrontmatter) {
      // If there are additional settings, merge them with the default frontmatter
      if (Object.keys(additionalSettings).length > 0) {
        const defaultFrontmatter = parseSettingsFrontmatter(settings.defaultChatFrontmatter);
        const mergedFrontmatter = { ...defaultFrontmatter, ...additionalSettings };

        return this.objectToYamlFrontmatter(mergedFrontmatter);
      }

      // If no additional settings, return the default frontmatter as is
      return settings.defaultChatFrontmatter + "\n\n";
    }

    // If no default frontmatter in settings, generate one from scratch
    // Determine the AI service type
    const aiService = additionalSettings.aiService || AI_SERVICE_OPENAI;

    // Get the default config for the service type
    let frontmatterObj: Record<string, any> = {
      stream: settings.stream,
      ...additionalSettings,
    };

    // Add service-specific properties
    switch (aiService) {
      case AI_SERVICE_OPENAI:
        frontmatterObj = {
          ...frontmatterObj,
          model: DEFAULT_OPENAI_CONFIG.model,
          temperature: DEFAULT_OPENAI_CONFIG.temperature,
          top_p: DEFAULT_OPENAI_CONFIG.top_p,
          max_tokens: DEFAULT_OPENAI_CONFIG.max_tokens,
          presence_penalty: DEFAULT_OPENAI_CONFIG.presence_penalty,
          frequency_penalty: DEFAULT_OPENAI_CONFIG.frequency_penalty,
        };
        break;
      case AI_SERVICE_OLLAMA:
        frontmatterObj = {
          ...frontmatterObj,
          model: DEFAULT_OLLAMA_CONFIG.model,
          url: DEFAULT_OLLAMA_CONFIG.url,
        };
        break;
      case AI_SERVICE_OPENROUTER:
        frontmatterObj = {
          ...frontmatterObj,
          model: DEFAULT_OPENROUTER_CONFIG.model,
          temperature: DEFAULT_OPENROUTER_CONFIG.temperature,
          top_p: DEFAULT_OPENROUTER_CONFIG.top_p,
          max_tokens: DEFAULT_OPENROUTER_CONFIG.max_tokens,
          presence_penalty: DEFAULT_OPENROUTER_CONFIG.presence_penalty,
          frequency_penalty: DEFAULT_OPENROUTER_CONFIG.frequency_penalty,
        };
        break;
      case AI_SERVICE_LMSTUDIO:
        frontmatterObj = {
          ...frontmatterObj,
          model: DEFAULT_LMSTUDIO_CONFIG.model,
          url: DEFAULT_LMSTUDIO_CONFIG.url,
          temperature: DEFAULT_LMSTUDIO_CONFIG.temperature,
          top_p: DEFAULT_LMSTUDIO_CONFIG.top_p,
          max_tokens: DEFAULT_LMSTUDIO_CONFIG.max_tokens,
          presence_penalty: DEFAULT_LMSTUDIO_CONFIG.presence_penalty,
          frequency_penalty: DEFAULT_LMSTUDIO_CONFIG.frequency_penalty,
        };
        break;
      case AI_SERVICE_ANTHROPIC:
        frontmatterObj = {
          ...frontmatterObj,
          model: DEFAULT_ANTHROPIC_CONFIG.model,
          url: DEFAULT_ANTHROPIC_CONFIG.url,
          temperature: DEFAULT_ANTHROPIC_CONFIG.temperature,
          max_tokens: DEFAULT_ANTHROPIC_CONFIG.max_tokens,
        };
        break;
    }

    return this.objectToYamlFrontmatter(frontmatterObj);
  }
}
