import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_ANTHROPIC, PLUGIN_SYSTEM_MESSAGE, ROLE_ASSISTANT, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  aiService: AI_SERVICE_ANTHROPIC,
  max_tokens: 1024,
  model: "claude-3-7-sonnet-20250219",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 1,
  title: "Untitled",
  url: "https://api.anthropic.com",
};

export const fetchAvailableAnthropicModels = async (url: string, apiKey: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    if (!isValidApiKey(apiKey)) {
      console.error("Anthropic API key is missing. Please add your Anthropic API key in the settings.");
      return [];
    }

    // Since Anthropic doesn't have a models endpoint like OpenAI,
    // we'll return a static list of available models
    return [
      "claude-3-7-sonnet-20250219",
      "claude-3-5-sonnet-20240620",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
      "claude-2.1",
      "claude-2.0",
      "claude-instant-1.2",
    ];
  } catch (error) {
    console.error("Error fetching models:", error);
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

  createPayload(config: AnthropicConfig, messages: Message[]): AnthropicStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands - for Anthropic, we handle them in the system field
    let systemPrompt = "";
    if (config.system_commands && config.system_commands.length > 0) {
      systemPrompt = config.system_commands.join("\n\n");
      console.log(`[ChatGPT MD] Added system commands to Anthropic system prompt`);
    }

    // Convert messages to Anthropic format
    const anthropicMessages = this.convertToAnthropicMessages(messages);

    // Create base payload
    const payload: AnthropicStreamPayload = {
      model: modelName,
      messages: anthropicMessages,
      max_tokens: config.max_tokens,
      stream: config.stream,
    };

    // Add system prompt if available
    if (systemPrompt) {
      payload.system = systemPrompt;
    }

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
    setAtCursor?: boolean | undefined
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    // Use the default implementation from BaseAiService
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AnthropicConfig
  ): Promise<any> {
    // Use the default implementation from BaseAiService
    return this.defaultCallNonStreamingAPI(apiKey, messages, config);
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }

  /**
   * Override prepareApiCall to add Anthropic-specific headers
   */
  protected prepareApiCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    skipPluginSystemMessage: boolean = false
  ) {
    // Use base implementation for common logic
    const { payload, headers } = super.prepareApiCall(apiKey, messages, config, skipPluginSystemMessage);

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
