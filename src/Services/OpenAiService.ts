import { Editor, MarkdownView, Notice, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, CHAT_ERROR_RESPONSE, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "src/Services/EditorService";
import { IAiApiService, OpenAiModel } from "src/Services/AiService";

export const fetchAvailableOpenAiModels = async (url: string, apiKey: string) => {
  try {
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
      .filter(
        (model: OpenAiModel) =>
          model.id.includes("gpt") &&
          !model.id.includes("audio") &&
          !model.id.includes("realtime") &&
          !model.id.includes("instruct") &&
          !model.id.includes("chatgpt")
      )
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

export class OpenAiService implements IAiApiService {
  constructor(private streamManager: StreamManager) {}

  async callAIAPI(
    messages: Message[],
    options: Partial<OpenAIConfig> = {},
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any> {
    const config: OpenAIConfig = { ...DEFAULT_OPENAI_CONFIG, ...options };
    return options.stream && editor
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor)
      : this.callNonStreamingAPI(apiKey, messages, config);
  }

  async inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<any> {
    if (!view.file) {
      throw new Error("No active file found");
    }

    console.log("[ChatGPT MD] auto inferring title from messages");

    const inferredTitle = await this.inferTitleFromMessages(settings.apiKey, messages, settings);

    if (inferredTitle) {
      console.log(`[ChatGPT MD] automatically inferred title: ${inferredTitle}. Changing file name...`);
      await editorService.writeInferredTitle(view, inferredTitle);
    } else {
      new Notice("[ChatGPT MD] Could not infer title", 5000);
    }
  }

  private handleAPIError(err: any, config: OpenAIConfig, prefix: string) {
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

  private createPayload(config: OpenAIConfig, messages: Message[]): OpenAIStreamPayload {
    return {
      model: config.model,
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

  private async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<{ fullstr: string; mode: "streaming" }> {
    try {
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

      const response = `${CHAT_ERROR_RESPONSE}${NEWLINE}${err}`;
      return { fullstr: response, mode: "streaming" };
    }
  }

  private async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

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

  private inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any) => {
    try {
      if (messages.length < 2) {
        new Notice("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon, back slash or forward slash. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      const config = { ...DEFAULT_OPENAI_CONFIG, ...settings };

      return await this.callNonStreamingAPI(settings.apiKey, [{ role: ROLE_USER, content: prompt }], config);
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
  model: "gpt-4o-mini",
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
