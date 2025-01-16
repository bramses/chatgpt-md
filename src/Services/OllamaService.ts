import { Editor, Notice, requestUrl } from "obsidian";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";

export interface OllamaStreamPayload {
  model: string;
  messages: Array<Message>;
  stream: boolean;
}

export interface OllamaConfig {
  model: string;
  url: string;
}

export const DEFAULT_CUSTOM_API_CONFIG: OllamaConfig = {
  model: "gemma2",
  url: "http://localhost:11434/api/chat",
};

export class OllamaService {
  constructor(private streamManager: StreamManager) {}

  async callOllamaAPI(
    apiKey: string,
    messages: Message[],
    options: Partial<OllamaConfig> = {},
    stream: boolean = false,
    editor: Editor,
    headingPrefix?: string,
    setAtCursor?: boolean
  ): Promise<any> {
    const config: OllamaConfig = {
      ...DEFAULT_CUSTOM_API_CONFIG,
      ...options,
    };

    return this.callStreamingAPI(messages, config, stream, headingPrefix, editor, setAtCursor);
  }

  private async callStreamingAPI(
    messages: Message[],
    config: OllamaConfig,
    stream: boolean,
    headingPrefix: string | undefined,
    editor: Editor,
    setAtCursor: boolean | undefined
  ): Promise<any> {
    try {
      const response = await this.streamManager.stream(
        editor,
        config.url + "/api/chat",
        {
          model: config.model,
          messages,
          stream,
        },
        { "Content-Type": "application/json" },
        false,
        !!setAtCursor,
        headingPrefix || ""
      );

      return { fullstr: response, mode: "streaming" };
    } catch (err) {
      if (err instanceof Object) {
        if (err.error) {
          new Notice(`[Custom API] Stream Error :: ${err.error.message}`);
          throw new Error(JSON.stringify(err.error));
        }
      }
      new Notice(`Issue calling ${config.model}, see console for more details`);
      throw new Error("Issue calling custom API with streaming enabled:" + err);
    }
  }

  private async callNonStreamingAPI(apiKey: string, messages: Message[], config: OllamaConfig): Promise<any> {
    try {
      const responseUrl = await requestUrl({
        url: config.url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`, // Include if needed by your custom API
          "Content-Type": "application/json",
        },
        contentType: "application/json",
        body: JSON.stringify({
          model: config.model,
          messages: messages,
        }),
        throw: false,
      });

      const response = responseUrl.text;
      const responseJSON = JSON.parse(response);

      if (responseJSON.error) {
        new Notice(`[Custom API] Error :: ${responseJSON.error.message}`);
        throw new Error(JSON.stringify(responseJSON.error));
      }

      return responseJSON.choices[0].message.content;
    } catch (err) {
      if (err instanceof Object) {
        if (err.error) {
          new Notice(`[Custom API] Error :: ${err.error.message}`);
          throw new Error(JSON.stringify(err.error));
        }
      }
      new Notice(`Issue calling ${config.model}, see console for more details`);
      throw new Error("Issue calling custom API with non-streaming enabled:" + err);
    }
  }
}
