import { Editor, requestUrl } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_ANTHROPIC, ROLE_ASSISTANT, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
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
    // Use the dedicated Anthropic provider from @ai-sdk/anthropic
    this.provider = createAnthropic({
      apiKey: "", // Will be set per request via headers
    });
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

  createPayload(config: AnthropicConfig, messages: Message[]): AnthropicStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Convert messages to Anthropic format
    const anthropicMessages = this.convertToAnthropicMessages(messages);

    // Create base payload
    const payload: AnthropicStreamPayload = {
      model: modelName,
      messages: anthropicMessages,
      max_tokens: config.max_tokens,
      stream: config.stream,
    };

    // Add temperature if available
    if (config.temperature !== undefined) {
      payload.temperature = config.temperature;
    }

    return payload;
  }

  /**
   * Convert standard messages to Anthropic format
   * Anthropic only supports 'user' and 'assistant' roles
   */
  private convertToAnthropicMessages(messages: Message[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    // Process messages and convert roles
    for (const message of messages) {
      // Skip system messages as they're handled separately in Anthropic
      if (message.role === ROLE_SYSTEM) {
        continue;
      }

      // Map roles to Anthropic format
      let role: "user" | "assistant";
      if (message.role === ROLE_ASSISTANT) {
        role = "assistant";
      } else {
        // All other roles (user, developer) are treated as user
        role = "user";
      }

      result.push({
        role,
        content: message.content,
      });
    }

    return result;
  }

  handleAPIError(err: any, config: AnthropicConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_ANTHROPIC_CONFIG.url,
      aiService: AI_SERVICE_ANTHROPIC,
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_ANTHROPIC_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_ANTHROPIC_CONFIG.url, AI_SERVICE_ANTHROPIC) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, AI_SERVICE_ANTHROPIC, {
      context,
      showNotification: true,
      logToConsole: true,
    }) as never;
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
    // Use the default implementation from BaseAiService
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AnthropicConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    // Use the default implementation from BaseAiService
    return this.defaultCallNonStreamingAPI(apiKey, messages, config, settings);
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }

  /**
   * Override prepareApiCall to add Anthropic-specific headers and handle system message combination
   */
  protected prepareApiCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    settings: ChatGPT_MDSettings,
    skipPluginSystemMessage: boolean = false
  ) {
    // Validate API key
    this.apiAuthService.validateApiKey(apiKey, this.serviceType);

    // Add plugin system message to help LLM understand context (unless skipped)
    const finalMessages = skipPluginSystemMessage ? messages : this.addPluginSystemMessage(messages, settings);

    // Create payload and headers
    const anthropicConfig = config as AnthropicConfig;
    const payload = this.createPayload(anthropicConfig, finalMessages);
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

    // Handle system message combination for Anthropic
    if (!skipPluginSystemMessage) {
      const systemParts: string[] = [];

      // Always add plugin system message first
      systemParts.push(settings.pluginSystemMessage);

      // Add user system commands if they exist
      if (anthropicConfig.system_commands && anthropicConfig.system_commands.length > 0) {
        systemParts.push(anthropicConfig.system_commands.join("\n\n"));
      }

      // Combine all system messages
      payload.system = systemParts.join("\n\n");
      console.log(`[ChatGPT MD] Combined plugin system message with user system commands for Anthropic`);
    } else if (anthropicConfig.system_commands && anthropicConfig.system_commands.length > 0) {
      // If plugin system message is skipped (like for title inference), only use user system commands
      payload.system = anthropicConfig.system_commands.join("\n\n");
    }

    // Add Anthropic-specific header for direct browser access
    headers["anthropic-dangerous-direct-browser-access"] = "true";

    return { payload, headers };
  }
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicStreamPayload {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  stream: boolean;
  temperature?: number;
}

export interface AnthropicConfig {
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
