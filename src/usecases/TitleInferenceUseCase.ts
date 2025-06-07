import { IView } from "../core/abstractions/IView";
import { INotificationService } from "../core/abstractions/INotificationService";
import { ChatGPT_MDSettings } from "../Models/Config";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "../Constants";

/**
 * Dependencies required by the TitleInferenceUseCase
 */
export interface TitleInferenceUseCaseDependencies {
  getSettings: () => ChatGPT_MDSettings;
  getFrontmatter: (view: IView, settings: ChatGPT_MDSettings) => any;
  getMessages: (editor: any, settings: ChatGPT_MDSettings) => Promise<{ messages: string[] }>;
  getAiService: (aiService: string) => any;
  getApiKey: (settings: ChatGPT_MDSettings, aiService: string) => string;
  getAiApiUrls: (frontmatter: any) => { [key: string]: string };
}

/**
 * Result of title inference
 */
export interface TitleInferenceResult {
  success: boolean;
  error?: string;
  title?: string;
  modelUsed?: string;
}

/**
 * TitleInferenceUseCase - Handles automatic title inference from chat content
 *
 * Extracts the business logic for inferring titles from chat messages using AI.
 * Manages model selection, API configuration, and title generation.
 */
export class TitleInferenceUseCase {
  constructor(
    private dependencies: TitleInferenceUseCaseDependencies,
    private notificationService: INotificationService
  ) {}

  /**
   * Execute title inference for a chat
   */
  async execute(editor: any, view: IView, updateStatus: (message: string) => void): Promise<TitleInferenceResult> {
    try {
      const settings = this.dependencies.getSettings();
      const frontmatter = this.dependencies.getFrontmatter(view, settings);

      // Validate that model is set
      if (!frontmatter.model) {
        const errorMessage = "Model not set in frontmatter";
        console.log(`[ChatGPT MD] ${errorMessage}, cannot infer title`);
        this.notificationService.showWarning(`${errorMessage}. Please set a model in the frontmatter.`);

        return {
          success: false,
          error: errorMessage,
        };
      }

      // Show status
      updateStatus(`Calling ${frontmatter.model} for title inference`);

      // Get messages from editor
      const { messages } = await this.dependencies.getMessages(editor, settings);

      if (messages.length === 0) {
        const errorMessage = "No messages found to infer title from";
        this.notificationService.showWarning(errorMessage);

        return {
          success: false,
          error: errorMessage,
        };
      }

      // Prepare settings with API keys and URLs
      const settingsWithApiKey = this.prepareInferenceSettings(frontmatter, settings);

      // Get AI service and perform inference
      const aiService = this.dependencies.getAiService(frontmatter.aiService);

      const result = await aiService.inferTitle(view, settingsWithApiKey, messages);

      updateStatus(""); // Clear status

      return {
        success: true,
        title: result?.title,
        modelUsed: frontmatter.model,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error("[ChatGPT MD] Title inference error:", error);
      this.notificationService.showError(`Failed to infer title: ${errorMessage}`);

      updateStatus(""); // Clear status

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if title inference should be performed automatically
   */
  canInferTitle(settings: ChatGPT_MDSettings, view: IView, messageCount: number): boolean {
    if (!settings.autoInferTitle) return false;

    const file = view.getFile();
    if (!file) return false;

    // Check if filename matches timestamp format (indicating auto-generated name)
    const isTimestampName = this.isTimestampFilename(file.basename, settings.dateFormat);

    return isTimestampName && messageCount > 2; // Require at least a few messages
  }

  /**
   * Get default model for title inference if not specified
   */
  getDefaultInferenceModel(aiService: string): string {
    switch (aiService) {
      case AI_SERVICE_OPENAI:
        return "gpt-4o-mini"; // Use more efficient model for title inference
      case AI_SERVICE_OLLAMA:
        return "llama2";
      case AI_SERVICE_OPENROUTER:
        return "anthropic/claude-3-haiku:beta"; // Use faster model
      case AI_SERVICE_LMSTUDIO:
        return "local-model";
      case AI_SERVICE_ANTHROPIC:
        return "claude-3-haiku-20240307"; // Use faster model
      default:
        return "gpt-4o-mini";
    }
  }

  /**
   * Prepare settings object with proper API keys and configuration
   */
  private prepareInferenceSettings(frontmatter: any, settings: ChatGPT_MDSettings): any {
    const settingsWithApiKey = {
      ...settings,
      ...frontmatter,
      openrouterApiKey: this.dependencies.getApiKey(settings, AI_SERVICE_OPENROUTER),
      url: this.dependencies.getAiApiUrls(frontmatter)[frontmatter.aiService],
    };

    // Ensure model is set, use default if needed
    if (!settingsWithApiKey.model) {
      settingsWithApiKey.model = this.getDefaultInferenceModel(frontmatter.aiService);
      console.log(`[ChatGPT MD] Using default model for title inference: ${settingsWithApiKey.model}`);
    }

    return settingsWithApiKey;
  }

  /**
   * Check if filename matches timestamp format
   */
  private isTimestampFilename(filename: string, dateFormat: string): boolean {
    // Simple check - if filename contains only numbers and common date separators
    // This is a simplified version, could be more sophisticated
    const timestampPattern = /^[\d\-_\s:]+$/;
    return timestampPattern.test(filename.replace(/\.md$/, ""));
  }
}
