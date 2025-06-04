import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_LMSTUDIO, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService, OpenAiModel } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const DEFAULT_LMSTUDIO_CONFIG: LmStudioConfig = {
  aiService: AI_SERVICE_LMSTUDIO,
  frequency_penalty: 0,
  max_tokens: 300,
  model: "local-model",
  presence_penalty: 0,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 1,
  title: "Untitled",
  top_p: 1,
  url: "http://localhost:1234",
};

export const fetchAvailableLmStudioModels = async (url: string, apiKey?: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    // LM Studio might not require an API key, but we'll try with one if provided
    const headers =
      apiKey && isValidApiKey(apiKey)
        ? apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_LMSTUDIO)
        : { "Content-Type": "application/json" };

    // Use ApiService for the API request
    const apiService = new ApiService();
    const models = await apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_LMSTUDIO);

    return models.data
      .filter(
        (model: OpenAiModel) =>
          // Filter out any system models or non-chat models
          !model.id.includes("embedding") &&
          !model.id.includes("audio") &&
          !model.id.includes("transcribe") &&
          !model.id.includes("tts")
      )
      .sort((a: OpenAiModel, b: OpenAiModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenAiModel) => `lmstudio@${model.id}`);
  } catch (error) {
    console.error("Error fetching LM Studio models:", error);
    return [];
  }
};

export class LmStudioService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_LMSTUDIO;

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

  getDefaultConfig(): LmStudioConfig {
    return DEFAULT_LMSTUDIO_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_LMSTUDIO);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // LmStudio uses standard system role
  }

  protected supportsSystemField(): boolean {
    return false; // LmStudio uses messages array, not system field
  }

  createPayload(config: LmStudioConfig, messages: Message[]): LmStudioStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands using the centralized method
    const processedMessages = this.processSystemCommands(messages, config.system_commands);

    // Create base payload
    const payload: LmStudioStreamPayload = {
      model: modelName,
      messages: processedMessages,
      max_completion_tokens: config.max_tokens,
      stream: config.stream,
      temperature: config.temperature,
      top_p: config.top_p,
      presence_penalty: config.presence_penalty,
      frequency_penalty: config.frequency_penalty,
    };

    return payload;
  }

  handleAPIError(err: any, config: LmStudioConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_LMSTUDIO_CONFIG.url,
      aiService: AI_SERVICE_LMSTUDIO,
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_LMSTUDIO_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_LMSTUDIO_CONFIG.url, AI_SERVICE_LMSTUDIO) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, AI_SERVICE_LMSTUDIO, {
      context,
      showNotification: true,
      logToConsole: true,
    }) as never;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: LmStudioConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    // Use the default implementation from BaseAiService
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: LmStudioConfig
  ): Promise<any> {
    // Use the default implementation from BaseAiService
    return this.defaultCallNonStreamingAPI(apiKey, messages, config);
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }
}

export interface LmStudioStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  max_completion_tokens: number;
  stream: boolean;
}

export interface LmStudioConfig {
  aiService: string;
  frequency_penalty: number;
  max_tokens: number;
  model: string;
  presence_penalty: number;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;
  url: string;
}
