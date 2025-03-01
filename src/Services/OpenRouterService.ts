import { Editor } from "obsidian";
import { StreamManager } from "src/managers/StreamManager";
import { Message } from "src/Models/Message";
import { NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService } from "src/Services/AiService";
import { isValidApiKey } from "src/Utilities/SettingsUtils";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorUpdateService } from "./EditorUpdateService";

// Define a constant for OpenRouter service
export const AI_SERVICE_OPENROUTER = "openrouter";

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
  url: "https://openrouter.ai/api/",
};

export const fetchAvailableOpenRouterModels = async (apiKey: string) => {
  try {
    // Check if API key is empty or undefined
    if (!isValidApiKey(apiKey)) {
      console.error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
      return [];
    }

    // Use ApiService for the API request
    const apiService = new ApiService();
    const apiAuthService = new ApiAuthService();
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENROUTER);

    const models = await apiService.makeGetRequest(
      `${DEFAULT_OPENROUTER_CONFIG.url}v1/models`,
      headers,
      AI_SERVICE_OPENROUTER
    );

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
  protected editorUpdateService: EditorUpdateService;

  constructor(
    streamManager: StreamManager,
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser,
    editorUpdateService?: EditorUpdateService
  ) {
    super(streamManager, errorService, notificationService);
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.editorUpdateService = editorUpdateService || new EditorUpdateService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService(this.notificationService);
    this.apiResponseParser =
      apiResponseParser || new ApiResponseParser(this.editorUpdateService, this.notificationService);
  }

  getServiceType(): string {
    return AI_SERVICE_OPENROUTER;
  }

  getDefaultConfig(): OpenRouterConfig {
    return DEFAULT_OPENROUTER_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return settings.openrouterApiKey;
  }

  createPayload(config: OpenRouterConfig, messages: Message[]): OpenRouterStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    return {
      model: modelName,
      messages,
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
      aiService: this.getServiceType(),
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_OPENROUTER_CONFIG.url) {
      return this.errorService.handleUrlError(
        config.url,
        DEFAULT_OPENROUTER_CONFIG.url,
        this.getServiceType()
      ) as never;
    }

    // Use the centralized error handling
    return this.errorService.handleApiError(err, this.getServiceType(), {
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
  ): Promise<{ fullstr: string; mode: "streaming" }> {
    try {
      // Validate API key using ApiAuthService
      this.apiAuthService.validateApiKey(apiKey, "OpenRouter");

      // Create payload and headers
      const payload = this.createPayload(config, messages);
      const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.getServiceType());

      // Insert assistant header
      const initialCursor = this.editorUpdateService.insertAssistantHeader(editor, headingPrefix, payload.model);

      // Make streaming request using ApiService
      const response = await this.apiService.makeStreamingRequest(
        `${config.url}v1/chat/completions`,
        payload,
        headers,
        this.getServiceType()
      );

      // Process the streaming response using ApiResponseParser
      const fullstr = await this.apiResponseParser.processStreamResponse(
        response,
        this.getServiceType(),
        editor,
        initialCursor,
        setAtCursor
      );

      return { fullstr, mode: "streaming" };
    } catch (err) {
      // The error is already handled by the ApiService, which uses ErrorService
      // Just return the error message for the chat
      const errorMessage = `Error: ${err}`;
      return { fullstr: errorMessage, mode: "streaming" };
    }
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      // Validate API key using ApiAuthService
      this.apiAuthService.validateApiKey(apiKey, "OpenRouter");

      config.stream = false;

      // Create payload and headers
      const payload = this.createPayload(config, messages);
      const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.getServiceType());

      // Make non-streaming request using ApiService
      return await this.apiService.makeNonStreamingRequest(
        `${config.url}v1/chat/completions`,
        payload,
        headers,
        this.getServiceType()
      );
    } catch (err) {
      // Use the error service to handle the error consistently
      return this.errorService.handleApiError(err, this.getServiceType(), {
        returnForChat: true,
        showNotification: true,
        context: { model: config.model, url: config.url },
      });
    }
  }

  protected inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any): Promise<string> => {
    try {
      if (messages.length < 2) {
        this.notificationService.showWarning("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon (:), back slash (\\), forward slash (/), asterisk (*), question mark (?), double quote ("), less than (<), greater than (>), or pipe (|) as these are invalid in file names. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      // Ensure model is set
      const config = {
        ...DEFAULT_OPENROUTER_CONFIG,
        ...settings,
      };

      // If model is not set in settings, use the default model
      if (!config.model) {
        console.log("[ChatGPT MD] Model not set for title inference, using default model");
        config.model = DEFAULT_OPENROUTER_CONFIG.model;
      }

      console.log("[ChatGPT MD] Inferring title with model:", config.model);
      return await this.callNonStreamingAPI(apiKey, [{ role: ROLE_USER, content: prompt }], config);
    } catch (err) {
      console.error("[ChatGPT MD] Error inferring title:", err);
      this.showNoTitleInferredNotification();
      return "";
    }
  };

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. Using default title.");
  }
}
