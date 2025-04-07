import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OLLAMA, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, OllamaModel, StreamingResponse } from "src/Services/AiService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";

export interface OllamaStreamPayload {
  model: string;
  messages: Message[];
  stream?: boolean;
}

export interface OllamaConfig {
  aiService: string;
  model: string;
  url: string;
  stream: boolean;
  title?: string;
  system_commands?: string[] | null;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  aiService: AI_SERVICE_OLLAMA,
  model: "llama2",
  url: "http://localhost:11434",
  stream: true,
  title: "Untitled",
  system_commands: null,
};

export const fetchAvailableOllamaModels = async () => {
  try {
    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = { "Content-Type": "application/json" };

    const json = await apiService.makeGetRequest(`${DEFAULT_OLLAMA_CONFIG.url}/api/tags`, headers, AI_SERVICE_OLLAMA);
    const models = json.models;

    return models
      .sort((a: OllamaModel, b: OllamaModel) => {
        if (a.name < b.name) return 1;
        if (a.name > b.name) return -1;
        return 0;
      })
      .map((model: OllamaModel) => `local@${model.name}`);
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
  protected apiResponseParser: ApiResponseParser;

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

  getServiceType(): string {
    return AI_SERVICE_OLLAMA;
  }

  getDefaultConfig(): OllamaConfig {
    return DEFAULT_OLLAMA_CONFIG;
  }

  getApiKeyFromSettings(_settings: ChatGPT_MDSettings): string {
    return ""; // Ollama doesn't use an API key
  }

  getUrlFromSettings(settings: ChatGPT_MDSettings): string {
    return settings.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url;
  }

  createPayload(config: OllamaConfig, messages: Message[]): OllamaStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands if they exist
    let processedMessages = messages;
    if (config.system_commands && config.system_commands.length > 0) {
      // Add system commands to the beginning of the messages
      const systemMessages = config.system_commands.map((command) => ({
        role: "system",
        content: command,
      }));

      processedMessages = [...systemMessages, ...messages];
      console.log(`[ChatGPT MD] Added ${systemMessages.length} system commands to messages`);
    }

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
      aiService: this.getServiceType(),
    };

    // Special handling for custom URL errors
    if (err instanceof Object && config.url !== DEFAULT_OLLAMA_CONFIG.url) {
      return this.errorService.handleUrlError(config.url, DEFAULT_OLLAMA_CONFIG.url, this.getServiceType()) as never;
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
    config: OllamaConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<StreamingResponse> {
    try {
      // Create payload and headers
      const payload = this.createPayload(config, messages);
      const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.getServiceType());

      // Insert assistant header
      const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, payload.model);

      // Make streaming request using ApiService
      const response = await this.apiService.makeStreamingRequest(
        `${config.url}/api/chat`,
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
      console.error(`[ChatGPT MD] Ollama streaming error:`, err);
      const errorMessage = `Error: ${err}`;
      return { fullString: errorMessage, mode: "streaming" };
    }
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OllamaConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      config.stream = false;

      // Create payload and headers
      const payload = this.createPayload(config, messages);
      const headers = { "Content-Type": "application/json" };

      // Make non-streaming request using ApiService
      return await this.apiService.makeNonStreamingRequest(
        `${config.url}/api/chat`,
        payload,
        headers,
        this.getServiceType()
      );
    } catch (err) {
      // Use the error service to handle the error consistently
      console.error(`[ChatGPT MD] Ollama API error:`, err);

      // Check if this is a title inference call (based on message content)
      const isTitleInference =
        messages.length === 1 && messages[0].content && messages[0].content.includes("Infer title from the summary");

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
        ...DEFAULT_OLLAMA_CONFIG,
        ...settings,
      };

      // If model is not set in settings, use the default model
      if (!config.model) {
        console.log("[ChatGPT MD] Model not set for title inference, using default model");
        config.model = DEFAULT_OLLAMA_CONFIG.model;
      }

      console.log("[ChatGPT MD] Inferring title with model:", config.model);

      try {
        // Use a separate try/catch block for the API call to handle errors without returning them to the chat
        return await this.callNonStreamingAPI("", [{ role: ROLE_USER, content: prompt }], config);
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
