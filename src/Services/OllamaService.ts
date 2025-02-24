import { Editor, MarkdownView, Notice, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OLLAMA, NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "src/Services/EditorService";
import { IAiApiService, OllamaModel } from "src/Services/AiService";

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

export const DEFAULT_OLLAMA_API_CONFIG: OllamaConfig = {
  model: "gemma2",
  aiService: AI_SERVICE_OLLAMA,
  url: "http://localhost:11434",
  stream: true,
};

export const fetchAvailableOllamaModels = async () => {
  try {
    const response = await fetch(`${DEFAULT_OLLAMA_API_CONFIG.url}/api/tags`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) throw new Error("Failed to fetch models");
    const json = await response.json();
    const models = json.models;

    return models
      .sort((a: OllamaModel, b: OllamaModel) => {
        if (a.name < b.name) return 1;
        if (a.name > b.name) return -1;
        return 0;
      })
      .map((model: OllamaModel) => `local@${model.name.replace(":latest", "")}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OllamaService implements IAiApiService {
  constructor(private streamManager: StreamManager) {}

  async callAIAPI(
    messages: Message[],
    options: Partial<OllamaConfig> = {},
    headingPrefix?: string,
    editor?: Editor,
    setAtCursor?: boolean
  ): Promise<any> {
    const config = { ...DEFAULT_OLLAMA_API_CONFIG, ...options };

    return options.stream
      ? this.callStreamingAPI(messages, config, headingPrefix, editor!, setAtCursor)
      : this.callNonStreamingAPI(messages, config);
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

    const inferredTitle = await this.inferTitleFromMessages(messages, settings);

    if (inferredTitle) {
      console.log(`[ChatGPT MD] automatically inferred title: ${inferredTitle}. Changing file name...`);
      await editorService.writeInferredTitle(view, inferredTitle);
    } else {
      new Notice("[ChatGPT MD] Could not infer title", 5000);
    }
  }

  private async callStreamingAPI(
    messages: Message[],
    config: OllamaConfig,
    headingPrefix = "",
    editor: Editor,
    setAtCursor = false
  ): Promise<any> {
    try {
      const response = await this.streamManager.stream(
        editor,
        `${config.url}/api/chat`,
        {
          model: config.model,
          messages,
          stream: true,
        },
        { "Content-Type": "application/json" },
        config.aiService,
        setAtCursor,
        headingPrefix
      );
      return { fullstr: response, mode: "streaming" };
    } catch (err) {
      this.handleError(err, config.model);
      throw new Error(`Issue calling custom API with streaming enabled:${err}`);
    }
  }

  private async callNonStreamingAPI(messages: Message[], config: OllamaConfig): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      config.stream = false;

      const responseUrl = await requestUrl({
        url: `${config.url}/api/chat`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        contentType: "application/json",
        body: JSON.stringify({ model: config.model, messages, stream: false }),
      });
      const responseJSON = JSON.parse(responseUrl.text);
      if (responseJSON.error) throw new Error(JSON.stringify(responseJSON.error));
      return responseJSON.message.content;
    } catch (err) {
      this.handleError(err, config.model);
      throw new Error(`Issue calling custom API with non-streaming enabled:${err}`);
    }
  }

  private handleError(err: any, model: string) {
    if (err instanceof Object && err.error) {
      new Notice(`[Custom API] Error :: ${err.error.message}`);
    } else {
      new Notice(`Issue calling ${model}, see console for more details`);
    }
  }

  private inferTitleFromMessages = async (messages: string[], settings: any) => {
    try {
      if (messages.length < 2) {
        new Notice("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon, back slash or forward slash. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;
      const config = { ...DEFAULT_OLLAMA_API_CONFIG, ...settings };

      return await this.callNonStreamingAPI([{ role: ROLE_USER, content: prompt }], config);
    } catch (err) {
      new Notice("[ChatGPT MD] Error inferring title from messages");
      throw new Error("[ChatGPT MD] Error inferring title from messages" + err);
    }
  };
}
