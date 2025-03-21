import { Editor, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorService } from "./EditorService";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

/**
 * Interface defining the contract for AI service implementations
 */
export interface IAiApiService {
  /**
   * Call the AI API with the given parameters
   */
  callAIAPI(
    messages: Message[],
    options: Record<string, any>,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings
  ): Promise<{
    fullString: string;
    mode: string;
    wasAborted?: boolean;
  }>;

  /**
   * Infer a title from messages
   */
  inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string>;
}

/**
 * Type for streaming API response
 */
export type StreamingResponse = {
  fullString: string;
  mode: "streaming";
  wasAborted?: boolean;
};

/**
 * Base class for AI service implementations
 * Contains common functionality and defines abstract methods that must be implemented by subclasses
 */
export abstract class BaseAiService implements IAiApiService {
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected readonly errorService: ErrorService;
  protected readonly notificationService: NotificationService;

  constructor(errorService?: ErrorService, notificationService?: NotificationService) {
    this.notificationService = notificationService ?? new NotificationService();
    this.errorService = errorService ?? new ErrorService(this.notificationService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);
  }

  /**
   * Get the service type identifier
   */
  abstract getServiceType(): string;

  /**
   * Get the default configuration for this service
   */
  abstract getDefaultConfig(): Record<string, any>;

  /**
   * Create a payload for the API request
   */
  abstract createPayload(config: Record<string, any>, messages: Message[]): Record<string, any>;

  /**
   * Handle API errors
   */
  abstract handleAPIError(err: unknown, config: Record<string, any>, prefix: string): never;

  /**
   * Call the AI API with the given parameters
   */
  async callAIAPI(
    messages: Message[],
    options: Record<string, any> = {},
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
  ): Promise<string> {
    try {
      if (!view.file) {
        throw new Error("No active file found");
      }

      // Get the API key from settings
      const apiKey = this.getApiKeyFromSettings(settings);

      // Infer the title
      const title = await this.inferTitleFromMessages(apiKey, messages, settings);

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
   * Show a notification when title inference fails
   */
  protected showNoTitleInferredNotification(): void {
    this.notificationService?.showWarning("Could not infer title. The file name was not changed.");
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
    config: Record<string, any>,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean
  ): Promise<StreamingResponse>;

  /**
   * Call the AI API in non-streaming mode
   */
  protected abstract callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>
  ): Promise<any>;

  /**
   * Infer a title from messages
   */
  protected abstract inferTitleFromMessages(
    apiKey: string,
    messages: string[],
    settings: ChatGPT_MDSettings
  ): Promise<string>;

  /**
   * Stop streaming
   */
  public stopStreaming(): void {
    this.apiService?.stopStreaming();
  }

  /**
   * Process streaming result and handle aborted case
   * This centralizes the common logic for all AI services
   */
  protected processStreamingResult(result: { text: string; wasAborted: boolean }): StreamingResponse {
    // If streaming was aborted and text is empty, return empty string with wasAborted flag
    if (result.wasAborted && result.text === "") {
      return { fullString: "", mode: "streaming", wasAborted: true };
    }

    // Normal case - return the text with wasAborted flag
    return {
      fullString: result.text,
      mode: "streaming",
      wasAborted: result.wasAborted,
    };
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
  return "";
};
