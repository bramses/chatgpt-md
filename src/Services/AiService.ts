import { Editor, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorService } from "./EditorService";
import {
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  API_ENDPOINTS,
  NEWLINE,
  ROLE_USER,
  AI_SERVICE_LMSTUDIO,
} from "src/Constants";
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
    url: string,
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

  // Abstract property that subclasses must implement to specify their service type
  protected abstract serviceType: string;

  constructor(errorService?: ErrorService, notificationService?: NotificationService) {
    this.notificationService = notificationService ?? new NotificationService();
    this.errorService = errorService ?? new ErrorService(this.notificationService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);
  }

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
    url: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    const config = { ...this.getDefaultConfig(), ...options };

    // Use URL from settings if available
    if (settings) {
      config.url = url;
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
      const titleResponse = await this.inferTitleFromMessages(apiKey, messages, settings);

      // Extract the title string - handle both string and object responses
      let titleStr = "";

      if (typeof titleResponse === "string") {
        titleStr = titleResponse;
      } else if (titleResponse && typeof titleResponse === "object") {
        // Type assertion for the response object
        const responseObj = titleResponse as { fullString?: string };
        titleStr = responseObj.fullString || "";
      }

      // Only update the title if we got a valid non-empty title
      if (titleStr && titleStr.trim().length > 0) {
        // Update the title in the editor
        await editorService.writeInferredTitle(view, titleStr.trim());
        return titleStr.trim();
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
   * Infer a title from messages - each service can override this if needed,
   * but this provides a standard implementation
   */
  protected inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any): Promise<string> => {
    try {
      if (messages.length < 2) {
        this.notificationService.showWarning("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon (:), back slash (\\), forward slash (/), asterisk (*), question mark (?), double quote ("), less than (<), greater than (>), or pipe (|) as these are invalid in file names. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      // Get the default config for this service
      const defaultConfig = this.getDefaultConfig();

      // Ensure all settings are applied
      const config = {
        ...defaultConfig,
        ...settings,
      };

      // If model is not set in settings, use the default model
      if (!config.model) {
        console.log("[ChatGPT MD] Model not set for title inference, using default model");
        config.model = defaultConfig.model;
      }

      // Ensure we have a URL
      if (!config.url) {
        console.log("[ChatGPT MD] URL not set for title inference, using default URL");
        config.url = defaultConfig.url;
      }

      console.log("[ChatGPT MD] Inferring title with model:", config.model);

      try {
        // Use a separate try/catch block for the API call to handle errors without returning them to the chat
        return await this.callNonStreamingAPI(apiKey, [{ role: ROLE_USER, content: prompt }], config);
      } catch (apiError) {
        // Log the error but don't return it to the chat
        console.error(`[ChatGPT MD] Error calling API for title inference:`, apiError);
        return "";
      }
    } catch (err) {
      console.error(`[ChatGPT MD] Error inferring title:`, err);
      this.showNoTitleInferredNotification();
      return "";
    }
  };

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

  /**
   * Get the full API endpoint URL
   */
  protected getApiEndpoint(config: Record<string, any>): string {
    return `${config.url}${API_ENDPOINTS[this.serviceType as keyof typeof API_ENDPOINTS]}`;
  }

  /**
   * Prepare API call with common setup
   */
  protected prepareApiCall(apiKey: string | undefined, messages: Message[], config: Record<string, any>) {
    // Validate API key
    this.apiAuthService.validateApiKey(apiKey, this.serviceType);

    // Create payload and headers
    const payload = this.createPayload(config, messages);
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

    return { payload, headers };
  }

  /**
   * Handle API errors for both streaming and non-streaming calls
   */
  protected handleApiCallError(
    err: any,
    config: Record<string, any>,
    isTitleInference: boolean | string | undefined = false
  ): any {
    console.error(`[ChatGPT MD] ${this.serviceType} API error:`, err);

    // Convert string or any other truthy value to boolean
    const shouldThrow = Boolean(isTitleInference);

    if (shouldThrow) {
      // For title inference, just throw the error to be caught by the caller
      throw err;
    }

    // For regular chat, return the error message
    return this.errorService.handleApiError(err, this.serviceType, {
      returnForChat: true,
      showNotification: true,
      context: { model: config.model, url: config.url },
    });
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
export const aiProviderFromUrl = (url?: string, model?: string): string | undefined => {
  // Check model first
  if (model?.includes(AI_SERVICE_OPENROUTER)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (model?.startsWith("lmstudio@")) {
    return AI_SERVICE_LMSTUDIO;
  }
  if (model?.includes("local")) {
    // Check URL to distinguish between Ollama and LM Studio
    if (url?.includes("1234")) {
      return AI_SERVICE_LMSTUDIO;
    }
    return AI_SERVICE_OLLAMA;
  }

  // Then check URL patterns
  // Define URL patterns
  const OPENROUTER_URL_PATTERN = "openrouter";
  const LOCAL_URL_PATTERNS = ["localhost", "127.0.0.1"];
  const LMSTUDIO_URL_PATTERN = "1234"; // LM Studio default port

  if (url?.includes(OPENROUTER_URL_PATTERN)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (url?.includes(LMSTUDIO_URL_PATTERN)) {
    return AI_SERVICE_LMSTUDIO;
  }
  if (LOCAL_URL_PATTERNS.some((pattern) => url?.includes(pattern))) {
    return AI_SERVICE_OLLAMA;
  }

  // Return undefined if no provider can be determined
  return undefined;
};

/**
 * Determine AI provider based on available API keys
 */
export const aiProviderFromKeys = (config: Record<string, any>): string | null => {
  const hasOpenRouterKey = isValidApiKey(config.openrouterApiKey);
  const hasOpenAIKey = isValidApiKey(config.apiKey);

  if (hasOpenAIKey && hasOpenRouterKey) {
    return AI_SERVICE_OPENAI; // Default to OpenAI if both keys exist
  } else if (hasOpenRouterKey) {
    return AI_SERVICE_OPENROUTER;
  } else if (hasOpenAIKey) {
    return AI_SERVICE_OPENAI;
  }

  return null;
};
