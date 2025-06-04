import { Editor, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorService } from "./EditorService";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  API_ENDPOINTS,
  NEWLINE,
  PLUGIN_SYSTEM_MESSAGE,
  ROLE_SYSTEM,
  ROLE_USER,
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

  // Abstract property to specify the preferred role for system messages
  protected abstract getSystemMessageRole(): string;

  // Abstract property to specify if the service supports system field in payload
  protected abstract supportsSystemField(): boolean;

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
        // For title inference, we call the API directly without the plugin system message
        return await this.callNonStreamingAPIForTitleInference(apiKey, [{ role: ROLE_USER, content: prompt }], config);
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
   * Call non-streaming API specifically for title inference (without plugin system message)
   */
  protected async callNonStreamingAPIForTitleInference(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>
  ): Promise<any> {
    try {
      config.stream = false;
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config, true); // Skip plugin system message

      const response = await this.apiService.makeNonStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      // Return simple object with response and model
      return response;
    } catch (err) {
      throw err; // Re-throw for title inference error handling
    }
  }

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
   * Add plugin system message to messages array
   * This ensures the LLM understands the Obsidian context
   * Each service can specify its preferred role for system messages
   */
  protected addPluginSystemMessage(messages: Message[]): Message[] {
    // If service supports system field (like Anthropic), don't add to messages
    if (this.supportsSystemField()) {
      return messages;
    }

    const pluginSystemMessage: Message = {
      role: this.getSystemMessageRole(),
      content: PLUGIN_SYSTEM_MESSAGE,
    };

    // Add the plugin system message at the beginning
    return [pluginSystemMessage, ...messages];
  }

  /**
   * Process system commands for services that don't support system field
   */
  protected processSystemCommands(messages: Message[], systemCommands: string[] | null | undefined): Message[] {
    if (!systemCommands || systemCommands.length === 0) {
      return messages;
    }

    // If service supports system field, don't add to messages (handled in payload)
    if (this.supportsSystemField()) {
      return messages;
    }

    // Add system commands to the beginning of the messages
    const systemMessages = systemCommands.map((command) => ({
      role: this.getSystemMessageRole(),
      content: command,
    }));

    return [...systemMessages, ...messages];
  }

  /**
   * Prepare API call with common setup
   */
  protected prepareApiCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    skipPluginSystemMessage: boolean = false
  ) {
    // Validate API key
    this.apiAuthService.validateApiKey(apiKey, this.serviceType);

    // Add plugin system message to help LLM understand context (unless skipped)
    const finalMessages = skipPluginSystemMessage ? messages : this.addPluginSystemMessage(messages);

    // Create payload and headers
    const payload = this.createPayload(config, finalMessages);
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

    // Add plugin system message to payload if service supports system field and not skipped
    if (this.supportsSystemField() && !skipPluginSystemMessage && !payload.system) {
      payload.system = PLUGIN_SYSTEM_MESSAGE;
    }

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

  /**
   * Default streaming API implementation that can be used by most services
   */
  protected async defaultCallStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean
  ): Promise<StreamingResponse> {
    try {
      // Use the common preparation method
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config);

      // Insert assistant header
      const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, payload.model);

      // Make streaming request using ApiService with centralized endpoint
      const response = await this.apiService.makeStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      // Process the streaming response using ApiResponseParser
      const result = await this.apiResponseParser.processStreamResponse(
        response,
        this.serviceType,
        editor,
        cursorPositions,
        setAtCursor,
        this.apiService
      );

      // Use the helper method to process the result
      return this.processStreamingResult(result);
    } catch (err) {
      // The error is already handled by the ApiService, which uses ErrorService
      // Just return the error message for the chat
      const errorMessage = `Error: ${err}`;
      return { fullString: errorMessage, mode: "streaming" };
    }
  }

  /**
   * Default non-streaming API implementation that can be used by most services
   */
  protected async defaultCallNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      config.stream = false;
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config);

      const response = await this.apiService.makeNonStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      // Return simple object with response and model
      return { fullString: response, model: payload.model };
    } catch (err) {
      const isTitleInference =
        messages.length === 1 && messages[0].content?.toString().includes("Infer title from the summary");

      return this.handleApiCallError(err, config, isTitleInference);
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
 * Determine the AI provider from a URL or model
 */
export const aiProviderFromUrl = (url?: string, model?: string): string | undefined => {
  // Check model first for service prefixes
  if (model?.startsWith("openai@")) {
    return AI_SERVICE_OPENAI;
  }
  if (model?.includes(AI_SERVICE_OPENROUTER)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (model?.startsWith("lmstudio@")) {
    return AI_SERVICE_LMSTUDIO;
  }
  if (model?.startsWith("anthropic@")) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (model?.startsWith("ollama@")) {
    return AI_SERVICE_OLLAMA;
  }
  if (model?.startsWith("local@")) {
    // Backward compatibility: local@ prefix points to Ollama
    return AI_SERVICE_OLLAMA;
  }
  if (model?.includes("claude")) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (model?.includes("local")) {
    // Check URL to distinguish between Ollama and LM Studio for legacy "local" models
    if (url?.includes("1234")) {
      return AI_SERVICE_LMSTUDIO;
    }
    return AI_SERVICE_OLLAMA;
  }

  // Check for common OpenAI model patterns (backward compatibility)
  if (model?.includes("gpt") || model?.includes("o1") || model?.includes("o3") || model?.includes("o4")) {
    return AI_SERVICE_OPENAI;
  }

  // Then check URL patterns
  // Define URL patterns
  const OPENROUTER_URL_PATTERN = "openrouter";
  const ANTHROPIC_URL_PATTERN = "anthropic";
  const LOCAL_URL_PATTERNS = ["localhost", "127.0.0.1"];
  const LMSTUDIO_URL_PATTERN = "1234"; // LM Studio default port

  if (url?.includes(OPENROUTER_URL_PATTERN)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (url?.includes(ANTHROPIC_URL_PATTERN)) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (url?.includes(LMSTUDIO_URL_PATTERN)) {
    return AI_SERVICE_LMSTUDIO;
  }
  if (LOCAL_URL_PATTERNS.some((pattern) => url?.includes(pattern))) {
    return AI_SERVICE_OLLAMA;
  }

  // Default to OpenAI for models without explicit service identification
  // This maintains backward compatibility for existing configurations
  if (model && !url) {
    return AI_SERVICE_OPENAI;
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
  const hasAnthropicKey = isValidApiKey(config.anthropicApiKey);

  // Priority order: OpenAI > Anthropic > OpenRouter
  if (hasOpenAIKey) {
    return AI_SERVICE_OPENAI;
  } else if (hasAnthropicKey) {
    return AI_SERVICE_ANTHROPIC;
  } else if (hasOpenRouterKey) {
    return AI_SERVICE_OPENROUTER;
  }

  return null;
};
