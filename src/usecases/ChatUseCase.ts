import { Platform } from "obsidian";
import { IEditor } from "../core/abstractions/IEditor";
import { IView } from "../core/abstractions/IView";
import { INotificationService } from "../core/abstractions/INotificationService";
import { ChatGPT_MDSettings } from "../Models/Config";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  MIN_AUTO_INFER_MESSAGES,
} from "../Constants";
import { getHeadingPrefix, isTitleTimestampFormat } from "../Utilities/TextHelpers";

/**
 * Dependencies required by the ChatUseCase
 */
export interface ChatUseCaseDependencies {
  getSettings: () => ChatGPT_MDSettings;
  getFrontmatter: (view: IView, settings: ChatGPT_MDSettings) => any;
  getMessages: (
    editor: IEditor,
    settings: ChatGPT_MDSettings
  ) => Promise<{ messages: string[]; messagesWithRole: any[] }>;
  getAiService: (aiService: string) => any;
  getApiKey: (settings: ChatGPT_MDSettings, aiService: string) => string;
  getAiApiUrls: (frontmatter: any) => { [key: string]: string };
  moveCursorToEnd: (editor: IEditor) => void;
  processResponse: (editor: IEditor, response: any, settings: ChatGPT_MDSettings) => void;
  inferTitle?: (view: IView, settings: any, messages: string[]) => Promise<void>;
}

/**
 * Result of chat execution
 */
export interface ChatResult {
  success: boolean;
  error?: string;
  response?: any;
  titleInferred?: boolean;
}

/**
 * ChatUseCase - Handles the core chat functionality
 *
 * Extracts the complex business logic for AI chat interactions from the command layer.
 * Manages message processing, API calls, response handling, and auto title inference.
 */
export class ChatUseCase {
  constructor(
    private dependencies: ChatUseCaseDependencies,
    private notificationService: INotificationService
  ) {}

  /**
   * Execute a chat interaction
   */
  async execute(editor: IEditor, view: IView, updateStatus: (message: string) => void): Promise<ChatResult> {
    try {
      const settings = this.dependencies.getSettings();
      const frontmatter = this.dependencies.getFrontmatter(view, settings);

      // Get messages from editor
      const { messagesWithRole: messagesWithRoleAndMessage, messages } = await this.dependencies.getMessages(
        editor,
        settings
      );

      // Move cursor to end if generateAtCursor is false
      if (!settings.generateAtCursor) {
        this.dependencies.moveCursorToEnd(editor);
      }

      // Show status notification
      const statusMessage = `Calling ${frontmatter.model}`;
      if (Platform.isMobile) {
        this.notificationService.showInfo(`[ChatGPT MD] ${statusMessage}`);
      } else {
        updateStatus(statusMessage);
      }

      // Get AI service and make API call
      const aiService = this.dependencies.getAiService(frontmatter.aiService);
      const apiKey = this.dependencies.getApiKey(settings, frontmatter.aiService);
      const apiUrls = this.dependencies.getAiApiUrls(frontmatter);

      const response = await aiService.callAIAPI(
        messagesWithRoleAndMessage,
        frontmatter,
        getHeadingPrefix(settings.headingLevel),
        apiUrls[frontmatter.aiService],
        editor,
        settings.generateAtCursor,
        apiKey,
        settings
      );

      // Process the response
      this.dependencies.processResponse(editor, response, settings);

      // Handle auto title inference
      let titleInferred = false;
      if (this.shouldInferTitle(settings, view, messagesWithRoleAndMessage)) {
        titleInferred = await this.handleAutoTitleInference(view, frontmatter, settings, messages);
      }

      updateStatus(""); // Clear status

      return {
        success: true,
        response,
        titleInferred,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (Platform.isMobile) {
        this.notificationService.showError(`[ChatGPT MD] Error: ${errorMessage}`, 9000);
      } else {
        updateStatus("");
      }

      console.error("[ChatGPT MD] Chat error:", error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Determine if title should be auto-inferred
   */
  private shouldInferTitle(settings: ChatGPT_MDSettings, view: IView, messages: any[]): boolean {
    if (!settings.autoInferTitle) return false;
    if (!this.dependencies.inferTitle) return false;

    const file = view.getFile();
    const fileName = file?.basename || "";
    if (!isTitleTimestampFormat(fileName, settings.dateFormat)) return false;

    return messages.length > MIN_AUTO_INFER_MESSAGES;
  }

  /**
   * Handle automatic title inference
   */
  private async handleAutoTitleInference(
    view: IView,
    frontmatter: any,
    settings: ChatGPT_MDSettings,
    messages: string[]
  ): Promise<boolean> {
    try {
      if (!this.dependencies.inferTitle) return false;

      // Create settings object with correct API key and model
      const settingsWithApiKey = {
        ...frontmatter,
        openrouterApiKey: this.dependencies.getApiKey(settings, AI_SERVICE_OPENROUTER),
        url: this.dependencies.getAiApiUrls(frontmatter)[frontmatter.aiService],
      };

      // Ensure model is set for title inference
      if (!settingsWithApiKey.model) {
        console.log("[ChatGPT MD] Model not set for auto title inference, using default model");
        settingsWithApiKey.model = this.getDefaultModelForService(frontmatter.aiService);
      }

      console.log("[ChatGPT MD] Auto-inferring title with settings:", {
        aiService: frontmatter.aiService,
        model: settingsWithApiKey.model,
      });

      await this.dependencies.inferTitle(view, settingsWithApiKey, messages);
      return true;
    } catch (error) {
      console.error("[ChatGPT MD] Error during auto title inference:", error);
      return false;
    }
  }

  /**
   * Get default model for a given AI service
   */
  private getDefaultModelForService(aiService: string): string {
    switch (aiService) {
      case AI_SERVICE_OPENAI:
        return "gpt-4";
      case AI_SERVICE_OLLAMA:
        return "llama2";
      case AI_SERVICE_OPENROUTER:
        return "anthropic/claude-3-opus:beta";
      case AI_SERVICE_LMSTUDIO:
        return "local-model";
      case AI_SERVICE_ANTHROPIC:
        return "claude-3-sonnet-20240229";
      default:
        return "gpt-4";
    }
  }
}
