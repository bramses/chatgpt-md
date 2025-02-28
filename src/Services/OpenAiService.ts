import { Editor, Notice, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, OpenAiModel } from "src/Services/AiService";
import { isValidApiKey } from "src/Utilities/SettingsUtils";

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
  constructor(streamManager: StreamManager) {
    super(streamManager);
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
    if (err instanceof Object) {
      if (err.error) {
        new Notice(`${prefix} :: ${err.error.message}`);
        throw new Error(JSON.stringify(err.error));
      }
      if (config.url !== DEFAULT_OPENAI_CONFIG.url) {
        new Notice(`${prefix} calling specified url: ${config.url}`);
        throw new Error(`${prefix} calling specified url: ${config.url}`);
      }
      new Notice(`${prefix} :: ${JSON.stringify(err)}`);
      throw new Error(JSON.stringify(err));
    }
    new Notice(`${prefix} calling ${config.model}, see console for details`);
    throw new Error(`${prefix} see error: ${err}`);
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
      this.handleAPIError(err, config, "[ChatGPT MD] Stream = True Error");

      const response = `Error: ${err}`;
      return { fullstr: response, mode: "streaming" };
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
        new Notice(`[ChatGPT MD] Stream = False Error :: ${data.error.message}`);
        throw new Error(JSON.stringify(data.error));
      }
      return data.choices[0].message.content;
    } catch (err) {
      this.handleAPIError(err, config, "[ChatGPT MD] Error");
    }
  }

  protected inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any): Promise<string> => {
    try {
      if (messages.length < 2) {
        new Notice("Not enough messages to infer title. Minimum 2 messages.");
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
      new Notice("[ChatGPT MD] Error inferring title from messages");
      throw new Error("[ChatGPT MD] Error inferring title from messages" + err);
    }
  };
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
