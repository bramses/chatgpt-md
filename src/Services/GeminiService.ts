import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_GEMINI, ROLE_ASSISTANT, ROLE_SYSTEM, ROLE_USER } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  aiService: AI_SERVICE_GEMINI,
  max_tokens: 1024,
  model: "gemini@gemini-1.5-flash",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 1,
  title: "Untitled",
  top_p: 0.95,
  url: "https://generativelanguage.googleapis.com",
};

export const fetchAvailableGeminiModels = async (url: string, apiKey: string) => {
  try {
    if (!isValidApiKey(apiKey)) {
      console.error("Gemini API key is missing. Please add your Gemini API key in the settings.");
      return [];
    }

    // Call the Gemini models API endpoint
    const modelsUrl = `${url.replace(/\/$/, "")}/v1beta/models`;

    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Extract model names from the response and add gemini@ prefix
    if (data.models && Array.isArray(data.models)) {
      return data.models
        .filter((model: any) => {
          // Filter for text generation models only
          return (
            model.name &&
            model.supportedGenerationMethods &&
            model.supportedGenerationMethods.includes("generateContent") &&
            !model.name.includes("embedding")
          );
        })
        .map((model: any) => {
          // Extract model name from full path (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
          const modelName = model.name.replace("models/", "");
          return `gemini@${modelName}`;
        })
        .sort(); // Sort alphabetically for better UX
    }

    console.warn("Unexpected response format from Gemini models API");
    return [];
  } catch (error) {
    console.error("Error fetching Gemini models:", error);
    // Return empty array on error - the UI should handle this gracefully
    return [];
  }
};

export class GeminiService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_GEMINI;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    super(errorService, notificationService);
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService(this.notificationService);
    this.apiResponseParser = apiResponseParser || new ApiResponseParser(this.notificationService);
  }

  getDefaultConfig(): GeminiConfig {
    return DEFAULT_GEMINI_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_GEMINI);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Gemini uses system field, not message role
  }

  protected supportsSystemField(): boolean {
    return false; // Gemini doesn't support separate system field - system messages are included in contents
  }

  createPayload(config: GeminiConfig, messages: Message[]): GeminiStreamPayload {
    // Convert messages to Gemini format
    const geminiContents = this.convertToGeminiContents(messages);

    // Create base payload - Note: model is NOT included in payload for Gemini, it's in the URL
    const payload: GeminiStreamPayload = {
      contents: geminiContents,
      generationConfig: {
        maxOutputTokens: config.max_tokens,
        temperature: config.temperature,
        topP: config.top_p,
      },
    };

    return payload;
  }

  /**
   * Convert standard messages to Gemini format
   * Gemini uses 'user' and 'model' roles with contents array containing parts
   */
  private convertToGeminiContents(messages: Message[]): GeminiContent[] {
    const result: GeminiContent[] = [];

    // Process messages and convert roles
    for (const message of messages) {
      // Map roles to Gemini format
      let role: "user" | "model";
      if (message.role === ROLE_ASSISTANT) {
        role = "model"; // Gemini uses 'model' instead of 'assistant'
      } else {
        // All other roles (user, developer, system) are treated as user
        role = "user";
      }

      result.push({
        role,
        parts: [{ text: message.content }],
      });
    }

    return result;
  }

  handleAPIError(err: any, config: GeminiConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_GEMINI_CONFIG.url,
      aiService: AI_SERVICE_GEMINI,
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_GEMINI_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_GEMINI_CONFIG.url, AI_SERVICE_GEMINI) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, AI_SERVICE_GEMINI, {
      context,
      showNotification: true,
      logToConsole: true,
    }) as never;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: GeminiConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    try {
      // Use the common preparation method
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config);

      // Insert assistant header
      const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, config.model);

      // Make streaming request using ApiService with Gemini-specific endpoint
      const response = await this.apiService.makeStreamingRequest(
        this.getApiUrl(config),
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

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: GeminiConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      config.stream = false;
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config);

      const response = await this.apiService.makeNonStreamingRequest(
        this.getApiUrl(config), // Use custom URL generation for Gemini
        payload,
        headers,
        this.serviceType
      );

      // Return simple object with response and model
      return { fullString: response, model: config.model };
    } catch (err) {
      const isTitleInference =
        messages.length === 1 && messages[0].content?.toString().includes("Infer title from the summary");

      return this.handleApiCallError(err, config, isTitleInference);
    }
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }

  /**
   * Override callNonStreamingAPIForTitleInference to use custom Gemini URL generation
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
        this.getApiUrl(config), // Use custom URL generation for Gemini
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
   * Override prepareApiCall to handle Gemini-specific API structure
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
    const geminiConfig = config as GeminiConfig;
    const payload = this.createPayload(geminiConfig, finalMessages);
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

    // Gemini uses x-goog-api-key header
    headers["x-goog-api-key"] = apiKey!;

    return { payload, headers };
  }

  /**
   * Override getApiUrl to handle Gemini's model-specific endpoint structure
   */
  protected getApiUrl(config: Record<string, any>): string {
    const geminiConfig = config as GeminiConfig;
    const modelName = geminiConfig.model.includes("@") ? geminiConfig.model.split("@")[1] : geminiConfig.model;

    // Gemini uses different endpoints for streaming vs non-streaming
    if (geminiConfig.stream) {
      // For streaming, use streamGenerateContent with alt=sse parameter
      return `${geminiConfig.url}/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
    } else {
      return `${geminiConfig.url}/v1beta/models/${modelName}:generateContent`;
    }
  }
}

export interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiStreamPayload {
  contents: GeminiContent[];
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
    topP: number;
  };
}

export interface GeminiConfig {
  aiService: string;
  max_tokens: number;
  model: string;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;
  url: string;
}
