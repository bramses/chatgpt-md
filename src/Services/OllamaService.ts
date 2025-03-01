import { Editor, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OLLAMA, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, OllamaModel } from "src/Services/AiService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export interface OllamaStreamPayload {
  model: string;
  messages: Message[];
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
  url: "http://localhost:11434/api/",
  stream: true,
  title: "Untitled",
  system_commands: null,
};

export const fetchAvailableOllamaModels = async () => {
  try {
    const response = await fetch(`${DEFAULT_OLLAMA_CONFIG.url}tags`);
    if (!response.ok) throw new Error("Failed to fetch models");

    const json = await response.json();
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
  private errorService: ErrorService;
  private notificationService: NotificationService;

  constructor(streamManager: StreamManager, errorService?: ErrorService, notificationService?: NotificationService) {
    super(streamManager);
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
  }

  getServiceType(): string {
    return AI_SERVICE_OLLAMA;
  }

  getDefaultConfig(): OllamaConfig {
    return DEFAULT_OLLAMA_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    // Ollama doesn't use an API key
    return "";
  }

  createPayload(config: OllamaConfig, messages: Message[]): OllamaStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    return {
      model: modelName,
      messages,
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
    setAtCursor?: boolean
  ): Promise<{ fullstr: string; mode: "streaming" }> {
    try {
      const payload = this.createPayload(config, messages);
      const response = await this.streamManager.stream(
        editor,
        `${config.url}chat`,
        payload,
        {
          "Content-Type": "application/json",
        },
        config.aiService,
        setAtCursor,
        headingPrefix
      );
      return { fullstr: response, mode: "streaming" };
    } catch (err) {
      // The error is already handled by the StreamManager, which uses ErrorService
      // Just return the error message for the chat
      const errorMessage = `Error: ${err}`;
      return { fullstr: errorMessage, mode: "streaming" };
    }
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OllamaConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      const payload = this.createPayload(config, messages);
      const responseUrl = await requestUrl({
        url: `${config.url}chat`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        contentType: "application/json",
        body: JSON.stringify(payload),
        throw: false,
      });
      const data = responseUrl.json;
      if (data?.error) {
        // Use the error service to handle the error consistently
        return this.errorService.handleApiError({ error: data.error }, this.getServiceType(), {
          returnForChat: true,
          showNotification: true,
          context: { model: config.model, url: config.url },
        });
      }
      return data.message.content;
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
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon, back slash or forward slash. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      const config = {
        ...DEFAULT_OLLAMA_CONFIG,
        ...settings,
      };

      return await this.callNonStreamingAPI("", [{ role: ROLE_USER, content: prompt }], config);
    } catch (err) {
      // Use the error service for consistent error handling
      this.errorService.handleApiError(err, this.getServiceType(), {
        showNotification: true,
        logToConsole: true,
        context: {
          operation: "inferTitleFromMessages",
          model: settings.model || DEFAULT_OLLAMA_CONFIG.model,
          url: settings.url || DEFAULT_OLLAMA_CONFIG.url,
        },
      });
      return "";
    }
  };

  /**
   * Show a notification when title inference fails
   * Override of the base class method to use NotificationService
   */
  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning(`[${this.getServiceType()}] Could not infer title`);
  }
}
