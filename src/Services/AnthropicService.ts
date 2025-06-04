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

  createPayload(config: AnthropicConfig, messages: Message[]): AnthropicStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands if they exist
    let systemPrompt = "";
    if (config.system_commands && config.system_commands.length > 0) {
      // Join system commands into a single string for Anthropic's system prompt
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
    try {
      // Use the common preparation method
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config);

      // Insert assistant header
      const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, payload.model);

      // Make streaming request using ApiService with centralized endpoint
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
    config: AnthropicConfig
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

  /**
   * Override addPluginSystemMessage to use "system" field for Anthropic
   * This ensures the LLM understands the Obsidian context with the correct role
   */
  protected addPluginSystemMessage(messages: Message[]): Message[] {
    // For Anthropic, we'll handle the system message separately in createPayload
    // Just return the original messages
    return messages;
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
    // Validate API key
    this.apiAuthService.validateApiKey(apiKey, this.serviceType);

    // Add plugin system message to help LLM understand context (unless skipped)
    const finalMessages = skipPluginSystemMessage ? messages : this.addPluginSystemMessage(messages);

    // Create payload with system message
    const anthropicConfig = config as AnthropicConfig;
    const payload = this.createPayload(anthropicConfig, finalMessages);

    // If we're not skipping the plugin system message and it's not already in the payload
    if (!skipPluginSystemMessage && !payload.system) {
      payload.system = PLUGIN_SYSTEM_MESSAGE;
    }

    // Create headers with Anthropic-specific headers
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

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
