import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, ROLE_DEVELOPER } from "src/Constants";
import { BaseAiService, IAiApiService, OpenAiModel } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  aiService: AI_SERVICE_OPENAI,
  frequency_penalty: 0,
  max_tokens: 300,
  model: "openai@gpt-4",
  presence_penalty: 0,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 1,
  title: "Untitled",
  top_p: 1,
  url: "https://api.openai.com",
};

export const fetchAvailableOpenAiModels = async (url: string, apiKey: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    if (!isValidApiKey(apiKey)) {
      console.error("OpenAI API key is missing. Please add your OpenAI API key in the settings.");
      return [];
    }

    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENAI);

    const models = await apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_OPENAI);

    return models.data
      .filter(
        (model: OpenAiModel) =>
          (model.id.includes("o3") ||
            model.id.includes("o4") ||
            model.id.includes("o1") ||
            model.id.includes("gpt-4") ||
            model.id.includes("gpt-3")) &&
          !model.id.includes("audio") &&
          !model.id.includes("transcribe") &&
          !model.id.includes("realtime") &&
          !model.id.includes("o1-pro") &&
          !model.id.includes("tts")
      )
      .sort((a: OpenAiModel, b: OpenAiModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenAiModel) => `openai@${model.id}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OpenAiService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_OPENAI;

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

  getDefaultConfig(): OpenAIConfig {
    return DEFAULT_OPENAI_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_DEVELOPER; // OpenAI prefers developer role for system messages
  }

  protected supportsSystemField(): boolean {
    return false; // OpenAI uses messages array, not system field
  }

  createPayload(config: OpenAIConfig, messages: Message[]): OpenAIStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands using the centralized method
    const processedMessages = this.apiClient.processSystemCommands(
      messages,
      config.system_commands,
      this.supportsSystemField(),
      this.getSystemMessageRole()
    );

    // Create base payload
    const payload: OpenAIStreamPayload = {
      model: modelName,
      messages: processedMessages,
      max_completion_tokens: config.max_tokens,
      stream: config.stream,
    };

    // Only include these parameters if the model supports them
    // o1, o4, and search models don't support custom temperature and other parameters
    const isRestrictedModel = modelName.includes("search") || modelName.includes("o1") || modelName.includes("o4");

    if (!isRestrictedModel) {
      payload.temperature = config.temperature;
      payload.top_p = config.top_p;
      payload.presence_penalty = config.presence_penalty;
      payload.frequency_penalty = config.frequency_penalty;
    }

    return payload;
  }

  handleAPIError(err: any, config: OpenAIConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_OPENAI_CONFIG.url,
      aiService: AI_SERVICE_OPENAI,
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_OPENAI_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_OPENAI_CONFIG.url, AI_SERVICE_OPENAI) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, AI_SERVICE_OPENAI, {
      context,
      showNotification: true,
      logToConsole: true,
    }) as never;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig,
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
    config: OpenAIConfig
  ): Promise<any> {
    // Use the default implementation from BaseAiService
    return this.defaultCallNonStreamingAPI(apiKey, messages, config);
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }
}

export interface OpenAIStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_completion_tokens: number;
  stream: boolean;
}

export interface OpenAIConfig {
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
