import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENROUTER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, StreamingResponse } from "src/Services/AiService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";

// Define a constant for OpenRouter service
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
}

export interface OpenRouterStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  stop: string[] | null;
  max_tokens: number;
  stream: boolean;
}

export interface OpenRouterConfig {
  aiService: string;
  frequency_penalty: number;
  max_tokens: number;
  model: string;
  openrouterApiKey: string;
  presence_penalty: number;
  stop: string[] | null;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;
  url: string;
}

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  aiService: AI_SERVICE_OPENROUTER,
  frequency_penalty: 0.5,
  max_tokens: 300,
  model: "anthropic/claude-3-opus:beta",
  openrouterApiKey: "",
  presence_penalty: 0.5,
  stop: null,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.3,
  title: "Untitled",
  top_p: 1,
  url: "https://openrouter.ai",
};

export const fetchAvailableOpenRouterModels = async (url: string, apiKey: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    // Check if API key is empty or undefined
    if (!isValidApiKey(apiKey)) {
      console.error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
      return [];
    }

    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENROUTER);

    const models = await apiService.makeGetRequest(`${url}/api/v1/models`, headers, AI_SERVICE_OPENROUTER);

    return models.data
      .sort((a: OpenRouterModel, b: OpenRouterModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenRouterModel) => `${AI_SERVICE_OPENROUTER}@${model.id}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OpenRouterService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_OPENROUTER;

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

  getDefaultConfig(): OpenRouterConfig {
    return DEFAULT_OPENROUTER_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER);
  }

  createPayload(config: OpenRouterConfig, messages: Message[]): OpenRouterStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands if they exist
    let processedMessages = messages;
    if (config.system_commands && config.system_commands.length > 0) {
      // Add system commands to the beginning of the messages
      const systemMessages = config.system_commands.map((command) => ({
        role: "system",
        content: command,
      }));

      processedMessages = [...systemMessages, ...messages];
      console.log(`[ChatGPT MD] Added ${systemMessages.length} system commands to messages`);
    }

    return {
      model: modelName,
      messages: processedMessages,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      top_p: config.top_p,
      presence_penalty: config.presence_penalty,
      frequency_penalty: config.frequency_penalty,
      stream: config.stream,
      stop: config.stop,
    };
  }

  handleAPIError(err: any, config: OpenRouterConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_OPENROUTER_CONFIG.url,
      aiService: AI_SERVICE_OPENROUTER,
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_OPENROUTER_CONFIG.url) {
      return this.errorService.handleUrlError(
        config.url,
        DEFAULT_OPENROUTER_CONFIG.url,
        AI_SERVICE_OPENROUTER
      ) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, AI_SERVICE_OPENROUTER, {
      context,
      showNotification: true,
      logToConsole: true,
    }) as never;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<StreamingResponse> {
    try {
      // Use the common preparation method
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config);

      // Insert assistant header
      const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, payload.model);

      // Make streaming request using ApiService with the centralized endpoint
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

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig
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

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }
}
