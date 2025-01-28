import { Editor, Notice, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OLLAMA } from "../Constants";

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

export class OllamaService {
  constructor(private streamManager: StreamManager) {}

  async callOllamaAPI(
    messages: Message[],
    options: Partial<OllamaConfig> = {},
    editor?: Editor,
    headingPrefix?: string,
    setAtCursor?: boolean
  ): Promise<any> {
    const config = { ...DEFAULT_OLLAMA_API_CONFIG, ...options };

    return options.stream
      ? this.callStreamingAPI(messages, config, headingPrefix, editor!, setAtCursor)
      : this.callNonStreamingAPI(messages, config);
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
        { model: config.model, messages, stream: true },
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
      console.log(`[ChatGPT MD] "stream"`, config);

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
}
