import { Editor } from "obsidian";
import { StreamManager } from "src/managers/StreamManager";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, OpenAiModel } from "src/Services/AiService";
import { isValidApiKey } from "src/Utilities/SettingsUtils";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorUpdateService } from "./EditorUpdateService";

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  aiService: AI_SERVICE_OPENAI,
  frequency_penalty: 0.5,
  max_tokens: 300,
  model: "gpt-4",
  n: 1,
  presence_penalty: 0.5,
  stop: null,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.3,
  title: "Untitled",
  top_p: 1,
  url: "https://api.openai.com/",
};

export const fetchAvailableOpenAiModels = async (url: string, apiKey: string) => {
  try {
    if (!isValidApiKey(apiKey)) {
      console.error("OpenAI API key is missing. Please add your OpenAI API key in the settings.");
      return [];
    }

    // Use ApiService for the API request
    const apiService = new ApiService();
    const apiAuthService = new ApiAuthService();
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENAI);

    const models = await apiService.makeGetRequest(`${DEFAULT_OPENAI_CONFIG.url}v1/models`, headers, AI_SERVICE_OPENAI);

    return models.data
      .filter((model: OpenAiModel) => model.id.includes("gpt"))
      .sort((a: OpenAiModel, b: OpenAiModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenAiModel) => model.id);
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
    return AI_SERVICE_OPENAI;
  }

  getDefaultConfig(): OpenAIConfig {
    return DEFAULT_OPENAI_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return settings.apiKey;
  }

  getUrlFromSettings(settings: ChatGPT_MDSettings): string {
    return settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url;
  }

  createPayload(config: OpenAIConfig, messages: Message[]): OpenAIStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    return {
      model: modelName,
      messages,
      max_completion_tokens: config.max_tokens,
      temperature: config.temperature,
      top_p: config.top_p,
      presence_penalty: config.presence_penalty,
      frequency_penalty: config.frequency_penalty,
      stream: config.stream,
      stop: config.stop,
      n: config.n,
    };
  }

  handleAPIError(err: any, config: OpenAIConfig, prefix: string): never {
    // Use the new ErrorService to handle errors
    const context = {
      model: config.model,
      url: config.url,
      defaultUrl: DEFAULT_OPENAI_CONFIG.url,
      aiService: this.getServiceType(),
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_OPENAI_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_OPENAI_CONFIG.url, this.getServiceType()) as never;
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
    config: OpenAIConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<{ fullstr: string; mode: "streaming"; wasAborted?: boolean }> {
    try {
      // Validate API key using ApiAuthService
      this.apiAuthService.validateApiKey(apiKey, "OpenAI");

      // Create payload and headers
      const payload = this.createPayload(config, messages);
      const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.getServiceType());

      // Insert assistant header
      const cursorPositions = this.editorUpdateService.insertAssistantHeader(editor, headingPrefix, payload.model);

      // Make streaming request using ApiService
      const response = await this.apiService.makeStreamingRequest(
        `${config.url}v1/chat/completions`,
        payload,
        headers,
        this.getServiceType()
      );

      // Process the streaming response using ApiResponseParser
      const result = await this.apiResponseParser.processStreamResponse(
        response,
        this.getServiceType(),
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
      return { fullstr: errorMessage, mode: "streaming" };
    }
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      // Validate API key using ApiAuthService
      this.apiAuthService.validateApiKey(apiKey, "OpenAI");

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
      console.error(`[ChatGPT MD] OpenAI API error:`, err);

      // Check if this is a title inference call (based on message content)
      const isTitleInference =
        messages.length === 1 &&
        messages[0].content &&
        typeof messages[0].content === "string" &&
        messages[0].content.includes("Infer title from the summary");

      if (isTitleInference) {
        // For title inference, just throw the error to be caught by the caller
        throw err;
      }

      // For regular chat, return the error message
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
        ...DEFAULT_OPENAI_CONFIG,
        ...settings,
      };

      // If model is not set in settings, use the default model
      if (!config.model) {
        console.log("[ChatGPT MD] Model not set for title inference, using default model");
        config.model = DEFAULT_OPENAI_CONFIG.model;
      }

      console.log("[ChatGPT MD] Inferring title with model:", config.model);

      try {
        // Use a separate try/catch block for the API call to handle errors without returning them to the chat
        const result = await this.callNonStreamingAPI(apiKey, [{ role: ROLE_USER, content: prompt }], config);

        // Check if the result is an error message
        if (this.isErrorMessage(result)) {
          console.error("[ChatGPT MD] Error in title inference response:", result);
          return "";
        }

        return result;
      } catch (apiError) {
        // Log the error but don't return it to the chat
        console.error("[ChatGPT MD] Error calling API for title inference:", apiError);
        return "";
      }
    } catch (err) {
      console.error("[ChatGPT MD] Error inferring title:", err);
      this.showNoTitleInferredNotification();
      return "";
    }
  };

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }
}

export interface OpenAIStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  stop: string[] | null;
  n: number;
  max_completion_tokens: number;
  stream: boolean;
}

export interface OpenAIConfig {
  aiService: string;
  frequency_penalty: number;
  max_tokens: number;
  model: string;
  n: number;
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
