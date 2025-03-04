import { Message } from "src/Models/Message";
import { Editor, MarkdownView } from "obsidian";
import { StreamManager } from "src/managers/StreamManager";
import { StreamService } from "./StreamService";
import { EditorUpdateService } from "./EditorUpdateService";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { EditorService } from "src/Services/EditorService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";

/**
 * Interface defining the contract for AI service implementations
 */
export interface IAiApiService {
  /**
   * Call the AI API with the given parameters
   */
  callAIAPI(
    messages: Message[],
    options: any,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings
  ): Promise<any>;

  /**
   * Infer a title from messages
   */
  inferTitle(view: MarkdownView, settings: any, messages: string[], editorService: EditorService): any;
}

/**
 * Base class for AI service implementations
 * Contains common functionality and defines abstract methods that must be implemented by subclasses
 */
export abstract class BaseAiService implements IAiApiService {
  protected streamService: StreamService;
  protected editorUpdateService: EditorUpdateService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;

  constructor(
    protected streamManager: StreamManager,
    protected errorService?: ErrorService,
    protected notificationService?: NotificationService
  ) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.editorUpdateService = new EditorUpdateService(this.notificationService);
    this.streamService = new StreamService(this.errorService, this.notificationService, this.editorUpdateService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.editorUpdateService, this.notificationService);
  }

  /**
   * Get the service type identifier
   */
  abstract getServiceType(): string;

  /**
   * Get the default configuration for this service
   */
  abstract getDefaultConfig(): any;

  /**
   * Create a payload for the API request
   */
  abstract createPayload(config: any, messages: Message[]): any;

  /**
   * Handle API errors
   */
  abstract handleAPIError(err: any, config: any, prefix: string): never;

  /**
   * Call the AI API with the given parameters
   */
  async callAIAPI(
    messages: Message[],
    options: any = {},
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    const config = { ...this.getDefaultConfig(), ...options };

    // Use URL from settings if available
    if (settings) {
      config.url = this.getUrlFromSettings(settings);
    }

    return options.stream && editor
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor)
      : this.callNonStreamingAPI(apiKey, messages, config);
  }

  /**
   * Infer a title from messages
   */
  async inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<any> {
    try {
      if (!view.file) {
        throw new Error("No active file found");
      }

      // Get the API key from settings
      const apiKey = this.getApiKeyFromSettings(settings);

      // Infer the title
      const title = await this.inferTitleFromMessages(apiKey, messages, settings);

      // Check if the result is an error message
      if (this.isErrorMessage(title)) {
        console.error("[ChatGPT MD] Error detected in title inference result:", title);
        this.showNoTitleInferredNotification();
        return "";
      }

      // Only update the title if we got a valid non-empty title
      if (title && title.trim().length > 0) {
        // Update the title in the editor
        await editorService.writeInferredTitle(view, title);
        return title;
      } else {
        this.showNoTitleInferredNotification();
        return "";
      }
    } catch (error) {
      console.error("[ChatGPT MD] Error in inferTitle:", error);
      this.showNoTitleInferredNotification();
      return "";
    }
  }

  /**
   * Check if a string is an error message
   * @param text The text to check
   * @returns True if the text appears to be an error message
   */
  protected isErrorMessage(text: string): boolean {
    if (!text || typeof text !== "string") {
      return false;
    }

    // Common error message patterns
    const errorPatterns = [
      "I am sorry",
      "I could not answer",
      "because of an error",
      "what went wrong",
      "Error:",
      "error occurred",
      "failed",
      "invalid",
      "unauthorized",
      "not found",
      "API key",
      "Model-",
      "URL-",
    ];

    // Check if the text contains any error patterns
    return errorPatterns.some((pattern) => text.includes(pattern));
  }

  /**
   * Show a notification when title inference fails
   */
  protected showNoTitleInferredNotification(): void {
    if (this.notificationService) {
      this.notificationService.showWarning("Could not infer title. The file name was not changed.");
    }
  }

  /**
   * Get the API key from settings
   */
  abstract getApiKeyFromSettings(settings: ChatGPT_MDSettings): string;

  /**
   * Get the service URL from settings
   */
  abstract getUrlFromSettings(settings: ChatGPT_MDSettings): string;

  /**
   * Call the AI API in streaming mode
   */
  protected abstract callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: any,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean
  ): Promise<{ fullstr: string; mode: "streaming" }>;

  /**
   * Call the AI API in non-streaming mode
   */
  protected abstract callNonStreamingAPI(apiKey: string | undefined, messages: Message[], config: any): Promise<any>;

  /**
   * Infer a title from messages
   */
  protected abstract inferTitleFromMessages(apiKey: string, messages: string[], settings: any): Promise<string>;

  /**
   * Stop streaming
   */
  public stopStreaming(): void {
    if (this.apiService) {
      this.apiService.stopStreaming();
    }
  }
}

export interface OpenAiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface OllamaModel {
  name: string;
}

/**
 * Factory function to create an AI service instance based on the service type
 * This function is implemented in main.ts to avoid circular dependencies
 */
export const getAiApiService = (
  streamManager: StreamManager,
  serviceType: string,
  errorService?: ErrorService,
  notificationService?: NotificationService
): IAiApiService => {
  // This is a placeholder that will be replaced by the actual implementation in main.ts
  throw new Error("getAiApiService should be implemented in main.ts to avoid circular dependencies");
};

/**
 * Determine the AI provider from a URL or model
 */
export const aiProviderFromUrl = (url?: string, model?: string): string => {
  if (model?.includes(AI_SERVICE_OPENROUTER)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (model?.includes("local")) {
    return AI_SERVICE_OLLAMA;
  }
  if (url?.includes("openrouter")) {
    return AI_SERVICE_OPENROUTER;
  }
  if (url?.includes("localhost") || url?.includes("127.0.0.1")) {
    return AI_SERVICE_OLLAMA;
  }
  return AI_SERVICE_OPENAI;
};
