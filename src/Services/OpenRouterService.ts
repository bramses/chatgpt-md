import { Editor, MarkdownView, Notice, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "src/Services/EditorService";
import { IAiApiService } from "src/Services/AiService";

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
    if (!apiKey) {
      console.error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
      return [];
    }

    const response = await fetch(`${DEFAULT_OPENROUTER_CONFIG.url}v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/bramses/chatgpt-md",
        "X-Title": "Obsidian ChatGPT MD Plugin",
      },
    });
    if (!response.ok) throw new Error("Failed to fetch models");

    const json = await response.json();
    const models = json.data;

    return models
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

export class OpenRouterService implements IAiApiService {
  constructor(private streamManager: StreamManager) {}

  async callAIAPI(
    messages: Message[],
    options: Partial<OpenRouterConfig> = {},
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any> {
    const config: OpenRouterConfig = { ...DEFAULT_OPENROUTER_CONFIG, ...options };

    // Use the provided apiKey (which should be the openrouterApiKey from main.ts)
    // or fall back to the one in the config
    const openRouterApiKey = apiKey || config.openrouterApiKey;

    return options.stream && editor
      ? this.callStreamingAPI(openRouterApiKey, messages, config, editor, headingPrefix, setAtCursor)
      : this.callNonStreamingAPI(openRouterApiKey, messages, config);
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

    const inferredTitle = await this.inferTitleFromMessages(settings.openrouterApiKey, messages, settings);

    if (inferredTitle) {
      console.log(`[ChatGPT MD] automatically inferred title: ${inferredTitle}. Changing file name...`);
      await editorService.writeInferredTitle(view, inferredTitle);
    } else {
      new Notice("[ChatGPT MD] Could not infer title", 5000);
    }
  }

  private handleAPIError(err: any, config: OpenRouterConfig, prefix: string) {
    if (err instanceof Object) {
      if (err.error) {
        new Notice(`${prefix} :: ${err.error.message}`);
        throw new Error(JSON.stringify(err.error));
      }
      if (config.url !== DEFAULT_OPENROUTER_CONFIG.url) {
        new Notice(`${prefix} calling specified url: ${config.url}`);
        throw new Error(`${prefix} calling specified url: ${config.url}`);
      }
      new Notice(`${prefix} :: ${JSON.stringify(err)}`);
      throw new Error(JSON.stringify(err));
    }
    new Notice(`${prefix} calling ${config.model}, see console for details`);
    throw new Error(`${prefix} see error: ${err}`);
  }

  private createPayload(config: OpenRouterConfig, messages: Message[]): OpenRouterStreamPayload {
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

  private async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined
  ): Promise<{ fullstr: string; mode: "streaming" }> {
    try {
      // Check if API key is empty or undefined
      if (!apiKey) {
        throw new Error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
      }

      const payload = this.createPayload(config, messages);
      const response = await this.streamManager.stream(
        editor,
        `${config.url}v1/chat/completions`,
        payload,
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/bramses/chatgpt-md",
          "X-Title": "Obsidian ChatGPT MD Plugin",
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

  private async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      // Check if API key is empty or undefined
      if (!apiKey) {
        throw new Error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
      }

      config.stream = false;

      const payload = this.createPayload(config, messages);
      const responseUrl = await requestUrl({
        url: `${config.url}v1/chat/completions`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/bramses/chatgpt-md",
          "X-Title": "Obsidian ChatGPT MD Plugin",
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

      const config = {
        ...DEFAULT_OPENROUTER_CONFIG,
        ...settings,
        openrouterApiKey: apiKey || settings.openrouterApiKey || "",
      };

      // Use the apiKey directly
      return await this.callNonStreamingAPI(apiKey, [{ role: ROLE_USER, content: prompt }], config);
    } catch (err) {
      new Notice("[ChatGPT MD] Error inferring title from messages");
      throw new Error("[ChatGPT MD] Error inferring title from messages" + err);
    }
  };
}
