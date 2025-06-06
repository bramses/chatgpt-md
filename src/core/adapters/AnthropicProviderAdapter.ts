import { Editor } from "obsidian";
import { Message } from "../../Models/Message";
import { AIProvider, AIConfig, AIResponse } from "../managers/AIProviderManager";
import { AnthropicService } from "../../Services/AnthropicService";
import { ErrorService } from "../../Services/ErrorService";
import { NotificationService } from "../../Services/NotificationService";
import { ApiService } from "../../Services/ApiService";
import { ApiAuthService } from "../../Services/ApiAuthService";
import { ApiResponseParser } from "../../Services/ApiResponseParser";

/**
 * Anthropic Provider Adapter
 *
 * Adapts the existing AnthropicService to the new simplified AIProvider interface.
 */
export class AnthropicProviderAdapter implements AIProvider {
  private anthropicService: AnthropicService;

  constructor() {
    const notificationService = new NotificationService();
    const errorService = new ErrorService(notificationService);
    const apiService = new ApiService(errorService, notificationService);
    const apiAuthService = new ApiAuthService(notificationService);
    const apiResponseParser = new ApiResponseParser(notificationService);

    this.anthropicService = new AnthropicService(
      errorService,
      notificationService,
      apiService,
      apiAuthService,
      apiResponseParser
    );
  }

  async chat(messages: Message[], config: AIConfig): Promise<AIResponse> {
    try {
      const result = await this.anthropicService.callAIAPI(
        messages,
        this.convertConfig(config),
        "## ",
        config.urls?.anthropic || config.url || "https://api.anthropic.com",
        undefined,
        false,
        config.apiKeys?.anthropic || config.apiKey
      );

      return {
        content: result.fullString || "",
        model: config.model,
        wasAborted: result.wasAborted,
      };
    } catch (error) {
      console.error("[ChatGPT MD] Anthropic chat error:", error);
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

      const result = await this.anthropicService.callAIAPI(
        messages,
        streamConfig,
        "## ",
        config.urls?.anthropic || config.url || "https://api.anthropic.com",
        editor,
        false,
        config.apiKeys?.anthropic || config.apiKey
      );

      return {
        content: result.fullString || "",
        model: config.model,
        wasAborted: result.wasAborted,
      };
    } catch (error) {
      console.error("[ChatGPT MD] Anthropic stream chat error:", error);
      return {
        content: `Error: ${error}`,
        model: config.model,
      };
    }
  }

  async inferTitle(messages: string[], config: AIConfig): Promise<string> {
    try {
      const mockEditorService = {
        writeInferredTitle: async () => {},
      };

      const result = await this.anthropicService.inferTitle(
        { file: { name: "temp.md" } } as any,
        this.convertToSettings(config),
        messages,
        mockEditorService as any
      );

      return result || "";
    } catch (error) {
      console.error("[ChatGPT MD] Anthropic infer title error:", error);
      return "";
    }
  }

  stopStreaming(): void {
    this.anthropicService.stopStreaming();
  }

  private convertConfig(config: AIConfig): Record<string, any> {
    return {
      model: config.model,
      temperature: config.temperature || 0.7,
      max_tokens: config.maxTokens || 2000,
      stream: config.stream || false,
      url: config.urls?.anthropic || config.url || "https://api.anthropic.com",
      system_commands: config.system_commands || ["I am a helpful assistant."],
    };
  }

  private convertToSettings(config: AIConfig): any {
    return {
      model: config.model,
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000,
      anthropicApiKey: config.apiKeys?.anthropic || config.apiKey,
      anthropicUrl: config.urls?.anthropic || config.url || "https://api.anthropic.com",
      inferTitleLanguage: "English",
    };
  }
}
