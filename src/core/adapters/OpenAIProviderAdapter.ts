import { Editor } from "obsidian";
import { Message } from "../../Models/Message";
import { AIProvider, AIConfig, AIResponse } from "../managers/AIProviderManager";
import { OpenAiService } from "../../Services/OpenAiService";
import { ErrorService } from "../../Services/ErrorService";
import { NotificationService } from "../../Services/NotificationService";
import { ApiService } from "../../Services/ApiService";
import { ApiAuthService } from "../../Services/ApiAuthService";
import { ApiResponseParser } from "../../Services/ApiResponseParser";

/**
 * OpenAI Provider Adapter
 *
 * Adapts the existing OpenAiService to the new simplified AIProvider interface.
 * This maintains compatibility while using the new architecture.
 */
export class OpenAIProviderAdapter implements AIProvider {
  private openAiService: OpenAiService;

  constructor() {
    // Initialize dependencies as before
    const notificationService = new NotificationService();
    const errorService = new ErrorService(notificationService);
    const apiService = new ApiService(errorService, notificationService);
    const apiAuthService = new ApiAuthService(notificationService);
    const apiResponseParser = new ApiResponseParser(notificationService);

    this.openAiService = new OpenAiService(
      errorService,
      notificationService,
      apiService,
      apiAuthService,
      apiResponseParser
    );
  }

  async chat(messages: Message[], config: AIConfig): Promise<AIResponse> {
    try {
      const result = await this.openAiService.callAIAPI(
        messages,
        this.convertConfig(config),
        "## ", // headingPrefix
        config.urls?.openai || config.url || "https://api.openai.com",
        undefined, // editor (non-streaming)
        false, // setAtCursor
        config.apiKeys?.openai || config.apiKey
      );

      return {
        content: result.fullString || "",
        model: config.model,
        wasAborted: result.wasAborted,
      };
    } catch (error) {
      console.error("[ChatGPT MD] OpenAI chat error:", error);
      return {
        content: `Error: ${error}`,
        model: config.model,
      };
    }
  }

  async streamChat(
    messages: Message[],
    config: AIConfig,
    editor: Editor,
    onProgress?: (text: string) => void
  ): Promise<AIResponse> {
    try {
      const streamConfig = { ...this.convertConfig(config), stream: true };

      const result = await this.openAiService.callAIAPI(
        messages,
        streamConfig,
        "## ", // headingPrefix
        config.urls?.openai || config.url || "https://api.openai.com",
        editor,
        false, // setAtCursor
        config.apiKeys?.openai || config.apiKey
      );

      return {
        content: result.fullString || "",
        model: config.model,
        wasAborted: result.wasAborted,
      };
    } catch (error) {
      console.error("[ChatGPT MD] OpenAI stream chat error:", error);
      return {
        content: `Error: ${error}`,
        model: config.model,
      };
    }
  }

  async inferTitle(messages: string[], config: AIConfig): Promise<string> {
    try {
      // Create a mock editor service for title inference
      const mockEditorService = {
        writeInferredTitle: async () => {},
        // Add other required methods as no-ops
      };

      const result = await this.openAiService.inferTitle(
        // Mock view for title inference
        { file: { name: "temp.md" } } as any,
        this.convertToSettings(config),
        messages,
        mockEditorService as any
      );

      return result || "";
    } catch (error) {
      console.error("[ChatGPT MD] OpenAI infer title error:", error);
      return "";
    }
  }

  stopStreaming(): void {
    this.openAiService.stopStreaming();
  }

  /**
   * Convert simplified config to OpenAI service format
   */
  private convertConfig(config: AIConfig): Record<string, any> {
    return {
      model: config.model,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2000,
      stream: config.stream || false,
      url: config.urls?.openai || config.url || "https://api.openai.com",
      // Add other OpenAI-specific config
      presence_penalty: config.presence_penalty || 0,
      frequency_penalty: config.frequency_penalty || 0,
      system_commands: config.system_commands || ["I am a helpful assistant."],
    };
  }

  /**
   * Convert config to settings format for legacy compatibility
   */
  private convertToSettings(config: AIConfig): any {
    return {
      model: config.model,
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000,
      apiKey: config.apiKeys?.openai || config.apiKey,
      openaiUrl: config.urls?.openai || config.url || "https://api.openai.com",
      inferTitleLanguage: "English",
    };
  }
}
