import { Editor, requestUrl } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_ANTHROPIC, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  apiKey: "",
  aiService: AI_SERVICE_ANTHROPIC,
  max_tokens: 400,
  model: "anthropic@claude-sonnet-4-20250514",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  url: "https://api.anthropic.com",
};

export const fetchAvailableAnthropicModels = async (url: string, apiKey: string) => {
  try {
    if (!isValidApiKey(apiKey)) {
      console.error("Anthropic API key is missing. Please add your Anthropic API key in the settings.");
      return [];
    }

    // Call the Anthropic models API endpoint
    const modelsUrl = `${url.replace(/\/$/, "")}/v1/models`;

    const response = await requestUrl({
      url: modelsUrl,
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "Content-Type": "application/json",
      },
    });

    const data = response.json;

    // Extract model IDs from the response and add anthropic@ prefix
    if (data.data && Array.isArray(data.data)) {
      return data.data
        .filter((model: any) => model.type === "model" && model.id)
        .map((model: any) => `anthropic@${model.id}`)
        .sort(); // Sort alphabetically for better UX
    }

    console.warn("Unexpected response format from Anthropic models API");
    return [];
  } catch (error) {
    console.error("Error fetching Anthropic models:", error);
    // Return empty array on error - the UI should handle this gracefully
    return [];
  }
};

export class AnthropicService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_ANTHROPIC;
  protected provider: AnthropicProvider;

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

  getDefaultConfig(): AnthropicConfig {
    return DEFAULT_ANTHROPIC_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_ANTHROPIC);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Anthropic uses system field, not message role
  }

  protected supportsSystemField(): boolean {
    return true; // Anthropic supports system field in payload
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AnthropicConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Anthropic provider
    this.provider = createAnthropic({
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      headers: {
        "anthropic-dangerous-direct-browser-access": "true",
      },
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Use the common AI SDK streaming method from base class
    return this.callAiSdkStreamText(
      this.provider(modelName),
      modelName,
      messages,
      config,
      editor,
      headingPrefix,
      setAtCursor
    );
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AnthropicConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Anthropic provider
    this.provider = createAnthropic({
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      headers: {
        "anthropic-dangerous-direct-browser-access": "true",
      },
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), modelName, messages);
  }
}

export interface AnthropicConfig {
  apiKey: string;
  aiService: string;
  max_tokens: number;
  model: string;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  url: string;
}
