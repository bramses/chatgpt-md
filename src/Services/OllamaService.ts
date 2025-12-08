import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OLLAMA, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService, StreamingResponse } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { createOpenAICompatible, OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";

export interface OllamaModel {
  name: string;
  [key: string]: any;
}

export interface OllamaStreamPayload {
  model: string;
  messages: Message[];
  stream?: boolean;
}

export interface OllamaConfig {
  apiKey?: string;
  aiService: string;
  model: string;
  url: string;
  stream: boolean;
  title?: string;
  system_commands?: string[] | null;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  aiService: AI_SERVICE_OLLAMA,
  model: "",
  url: "http://localhost:11434",
  stream: true,
  title: "Untitled",
  system_commands: null,
};

export const fetchAvailableOllamaModels = async (url: string) => {
  try {
    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = { "Content-Type": "application/json" };

    const json = await apiService.makeGetRequest(`${url}/api/tags`, headers, AI_SERVICE_OLLAMA);
    const models = json.models;

    return models
      .sort((a: OllamaModel, b: OllamaModel) => {
        if (a.name < b.name) return 1;
        if (a.name > b.name) return -1;
        return 0;
      })
      .map((model: OllamaModel) => `ollama@${model.name}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OllamaService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected provider: OpenAICompatibleProvider;

  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_OLLAMA;

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
    this.provider = createOpenAICompatible({
      name: "ollama",
      baseURL: DEFAULT_OLLAMA_CONFIG.url,
    });
  }

  getDefaultConfig(): OllamaConfig {
    return DEFAULT_OLLAMA_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OLLAMA);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Ollama uses standard system role
  }

  protected supportsSystemField(): boolean {
    return false; // Ollama uses messages array, not system field
  }

  createPayload(config: OllamaConfig, messages: Message[]): OllamaStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands using the centralized method
    const processedMessages = this.processSystemCommands(messages, config.system_commands);

    return {
      model: modelName,
      messages: processedMessages,
      stream: config.stream,
    };
  }

  handleAPIError(err: any, config: OllamaConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_OLLAMA_CONFIG.url,
      aiService: AI_SERVICE_OLLAMA,
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_OLLAMA_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_OLLAMA_CONFIG.url, AI_SERVICE_OLLAMA) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, AI_SERVICE_OLLAMA, {
      context,
      showNotification: true,
      logToConsole: true,
    }) as never;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OllamaConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings
  ): Promise<StreamingResponse> {
    // Use the default implementation from BaseAiService
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OllamaConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Ollama provider (OpenAI-compatible)
    this.provider = createOpenAICompatible({
      name: "ollama",
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), modelName, messages);
  }
}
