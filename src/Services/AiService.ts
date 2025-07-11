import { Editor, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorService } from "./EditorService";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiClient } from "./ApiClient";
import { StreamingHandler } from "./StreamingHandler";
import { TitleInferenceService } from "./TitleInferenceService";

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
  protected readonly errorService: ErrorService;
  protected readonly notificationService: NotificationService;
  protected readonly apiClient: ApiClient;
  protected readonly streamingHandler: StreamingHandler;
  protected readonly titleInferenceService: TitleInferenceService;

  // Abstract property that subclasses must implement to specify their service type
  protected abstract serviceType: string;

  // Abstract property to specify the preferred role for system messages
  protected abstract getSystemMessageRole(): string;

  // Abstract property to specify if the service supports system field in payload
  protected abstract supportsSystemField(): boolean;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    this.notificationService = notificationService ?? new NotificationService();
    this.errorService = errorService ?? new ErrorService(this.notificationService);
    
    // Initialize services
    const apiSvc = apiService ?? new ApiService(this.errorService, this.notificationService);
    const apiAuthSvc = apiAuthService ?? new ApiAuthService(this.notificationService);
    const apiResponseParserSvc = apiResponseParser ?? new ApiResponseParser(this.notificationService);
    
    // Initialize composed services
    this.apiClient = new ApiClient(apiSvc, apiAuthSvc, this.errorService, this.notificationService);
    this.streamingHandler = new StreamingHandler(apiResponseParserSvc, this.apiClient);
    this.titleInferenceService = new TitleInferenceService(this.notificationService, this.apiClient);
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
    return this.titleInferenceService.inferTitle(
      view,
      settings,
      messages,
      editorService,
      this.serviceType,
      () => this.getDefaultConfig(),
      (settings: ChatGPT_MDSettings) => this.getApiKeyFromSettings(settings),
      (config: Record<string, any>, messages: Message[]) => this.createPayload(config, messages),
      this.supportsSystemField(),
      this.getSystemMessageRole()
    );
  }

  /**
   * Stop streaming
   */
  public stopStreaming(): void {
    this.streamingHandler.stopStreaming();
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
      // Prepare API call
      const { messages: finalMessages, headers } = this.apiClient.prepareApiCall(
        apiKey,
        messages,
        config,
        this.serviceType,
        this.supportsSystemField(),
        this.getSystemMessageRole()
      );

      // Create payload
      const payload = this.createPayload(config, finalMessages);

      // Use StreamingHandler to handle the streaming call
      return this.streamingHandler.handleStreamingCall(
        apiKey,
        messages,
        config,
        editor,
        headingPrefix,
        this.serviceType,
        payload,
        headers,
        setAtCursor
      );
    } catch (err) {
      // Return error message for the chat
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
      
      // Prepare API call
      const { messages: finalMessages, headers } = this.apiClient.prepareApiCall(
        apiKey,
        messages,
        config,
        this.serviceType,
        this.supportsSystemField(),
        this.getSystemMessageRole()
      );

      // Create payload
      const payload = this.createPayload(config, finalMessages);

      const response = await this.apiClient.makeNonStreamingRequest(
        this.apiClient.getApiEndpoint(config, this.serviceType),
        payload,
        headers,
        this.serviceType
      );

      // Return simple object with response and model
      return { fullString: response, model: payload.model };
    } catch (err) {
      const isTitleInference =
        messages.length === 1 && messages[0].content?.toString().includes("Infer title from the summary");

      return this.apiClient.handleApiError(err, this.serviceType, config, isTitleInference);
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
  if (model?.startsWith("gemini@")) {
    return AI_SERVICE_GEMINI;
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
  if (model?.includes("gemini")) {
    return AI_SERVICE_GEMINI;
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
  const GEMINI_URL_PATTERN = "generativelanguage.googleapis.com";
  const LOCAL_URL_PATTERNS = ["localhost", "127.0.0.1"];
  const LMSTUDIO_URL_PATTERN = "1234"; // LM Studio default port

  if (url?.includes(OPENROUTER_URL_PATTERN)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (url?.includes(ANTHROPIC_URL_PATTERN)) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (url?.includes(GEMINI_URL_PATTERN)) {
    return AI_SERVICE_GEMINI;
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
  const hasGeminiKey = isValidApiKey(config.geminiApiKey);

  // Priority order: OpenAI > Anthropic > Gemini > OpenRouter
  if (hasOpenAIKey) {
    return AI_SERVICE_OPENAI;
  } else if (hasAnthropicKey) {
    return AI_SERVICE_ANTHROPIC;
  } else if (hasGeminiKey) {
    return AI_SERVICE_GEMINI;
  } else if (hasOpenRouterKey) {
    return AI_SERVICE_OPENROUTER;
  }

  return null;
};
