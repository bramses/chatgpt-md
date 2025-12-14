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
import { createOpenAICompatible, OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import { ToolService } from "./ToolService";

export const DEFAULT_LMSTUDIO_CONFIG: LmStudioConfig = {
  aiService: AI_SERVICE_LMSTUDIO,
  frequency_penalty: 0,
  max_tokens: 400,
  model: "",
  presence_penalty: 0,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
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
  protected provider: OpenAICompatibleProvider;

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
    this.provider = createOpenAICompatible({
      name: "lmstudio",
      baseURL: DEFAULT_LMSTUDIO_CONFIG.url,
    });
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

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: LmStudioConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the LM Studio provider (OpenAI-compatible)
    this.provider = createOpenAICompatible({
      name: "lmstudio",
      apiKey: apiKey || "lmstudio", // LM Studio doesn't require real key
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK streaming method from base class
    return this.callAiSdkStreamText(
      this.provider(modelName),
      modelName,
      messages,
      config,
      editor,
      headingPrefix,
      setAtCursor,
      tools,
      toolService
    );
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: LmStudioConfig,
    settings?: ChatGPT_MDSettings,
    provider?: OpenAICompatibleProvider,
    toolService?: ToolService
  ): Promise<any> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the LM Studio provider (OpenAI-compatible)
    this.provider = createOpenAICompatible({
      name: "lmstudio",
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), modelName, messages, tools, toolService);
  }
}

export interface LmStudioConfig {
  apiKey?: string;
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
