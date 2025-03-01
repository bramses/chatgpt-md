import { Editor, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, OpenAiModel } from "src/Services/AiService";
import { isValidApiKey } from "src/Utilities/SettingsUtils";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const fetchAvailableOpenAiModels = async (url: string, apiKey: string) => {
  try {
    if (!isValidApiKey(apiKey)) {
      console.error("OpenAI API key is missing. Please add your OpenAI API key in the settings.");
      return [];
    }

    const response = await fetch(`${DEFAULT_OPENAI_CONFIG.url}v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) throw new Error("Failed to fetch models");

    const json = await response.json();
    const models = json.data;

    return models
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
  private errorService: ErrorService;
  private notificationService: NotificationService;

  constructor(streamManager: StreamManager, errorService?: ErrorService, notificationService?: NotificationService) {
    super(streamManager);
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
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
  ): Promise<{ fullstr: string; mode: "streaming" }> {
    try {
      // Validate API key
      this.validateApiKey(apiKey, "OpenAI");

      const payload = this.createPayload(config, messages);
      const response = await this.streamManager.stream(
        editor,
        `${config.url}v1/chat/completions`,
        payload,
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
    config: OpenAIConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      // Validate API key
      this.validateApiKey(apiKey, "OpenAI");

      config.stream = false;

      const payload = this.createPayload(config, messages);
      const responseUrl = await requestUrl({
        url: `${config.url}v1/chat/completions`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
      return data.choices[0].message.content;
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
        ...DEFAULT_OPENAI_CONFIG,
        ...settings,
      };

      return await this.callNonStreamingAPI(apiKey, [{ role: ROLE_USER, content: prompt }], config);
    } catch (err) {
      // Use the error service for consistent error handling
      this.errorService.handleApiError(err, this.getServiceType(), {
        showNotification: true,
        logToConsole: true,
        context: {
          operation: "inferTitleFromMessages",
          model: settings.model || DEFAULT_OPENAI_CONFIG.model,
          url: settings.url || DEFAULT_OPENAI_CONFIG.url,
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

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  aiService: AI_SERVICE_OPENAI,
  frequency_penalty: 0.5,
  max_tokens: 300,
  model: "gpt-3.5-turbo",
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
