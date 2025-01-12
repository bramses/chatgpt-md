import { Editor, Notice, requestUrl } from "obsidian";

import { DEFAULT_OPENAI_CONFIG, OpenAIConfig } from "src/Models/OpenAIConfig";
import { StreamManager } from "src/stream";
import { Message } from "src/Models/Message";
import { ROLE_USER } from "src/Constants";

export class OpenAIService {
  async callOpenAIAPI(
    apiKey: string,
    messages: Message[],
    options: Partial<OpenAIConfig> = {},
    stream: boolean = DEFAULT_OPENAI_CONFIG.stream,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean
  ): Promise<any> {
    const config: OpenAIConfig = {
      ...DEFAULT_OPENAI_CONFIG,
      ...options,
    };

    if (stream && editor) {
      return this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor);
    } else {
      return this.callNonStreamingAPI(apiKey, messages, config);
    }
  }

  constructor(private streamManager: StreamManager) {}

  private async callStreamingAPI(
    apiKey: string,
    messages: Message[],
    config: OpenAIConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor: boolean = false
  ): Promise<any> {
    try {
      const response = await this.streamManager.streamSSE(
        editor,
        apiKey,
        config.url,
        {
          model: config.model,
          messages: messages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          top_p: config.topP,
          presence_penalty: config.presencePenalty,
          frequency_penalty: config.frequencyPenalty,
          stream: config.stream,
          stop: config.stop,
          n: config.n,
          // logit_bias: logit_bias, // not yet supported
          // user: user, // not yet supported
        },
        setAtCursor,
        headingPrefix
      );
      return { fullstr: response, mode: "streaming" };
    } catch (err) {
      if (err instanceof Object) {
        if (err.error) {
          new Notice(`[ChatGPT MD] Stream = True Error :: ${err.error.message}`);
          throw new Error(JSON.stringify(err.error));
        } else {
          if (config.url !== DEFAULT_OPENAI_CONFIG.url) {
            new Notice("[ChatGPT MD] Issue calling specified url: " + config.url);
            throw new Error("[ChatGPT MD] Issue calling specified url: " + config.url);
          } else {
            new Notice(`[ChatGPT MD] Error :: ${JSON.stringify(err)}`);
            throw new Error(JSON.stringify(err));
          }
        }
      }

      new Notice(`issue calling ${config.model}, see console for more details`);
      throw new Error("issue calling OpenAI API, see error for more details: " + err);
    }
  }

  private async callNonStreamingAPI(apiKey: string, messages: Message[], config: OpenAIConfig): Promise<any> {
    try {
      const responseUrl = await requestUrl({
        url: config.url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        contentType: "application/json",
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          top_p: config.topP,
          presence_penalty: config.presencePenalty,
          frequency_penalty: config.frequencyPenalty,
          stream: config.stream,
          stop: config.stop,
          n: config.n,
          // logit_bias: logit_bias, // not yet supported
          // user: user, // not yet supported
        }),
        throw: false,
      });

      try {
        const json = responseUrl.json;
        if (json && json.error) {
          new Notice(`[ChatGPT MD] Stream = False Error :: ${json.error.message}`);
          throw new Error(JSON.stringify(json.error));
        }
      } catch (err) {
        // continue we got a valid str back
        if (err instanceof SyntaxError) {
          // continue
        } else {
          throw new Error(err as string);
        }
      }

      const response = responseUrl.text;
      const responseJSON = JSON.parse(response);
      return responseJSON.choices[0].message.content;
    } catch (err) {
      if (err instanceof Object) {
        if (err.error) {
          new Notice(`[ChatGPT MD] Error :: ${err.error.message}`);
          throw new Error(JSON.stringify(err.error));
        } else {
          if (config.url !== DEFAULT_OPENAI_CONFIG.url) {
            new Notice("[ChatGPT MD] Issue calling specified url: " + config.url);
            throw new Error("[ChatGPT MD] Issue calling specified url: " + config.url);
          } else {
            new Notice(`[ChatGPT MD] Error :: ${JSON.stringify(err)}`);
            throw new Error(JSON.stringify(err));
          }
        }
      }
      new Notice(`issue calling ${config.model}, see console for more details`);
      throw new Error("issue calling OpenAI API, see error for more details: " + err);
    }
  }

  async inferTitleFromMessages(
    apiKey: string,
    messages: string[],
    titleMaxTokens: number,
    titleTemperature: number,
    inferTitleLanguage: string
  ): Promise<string> {
    try {
      if (messages.length < 2) {
        new Notice("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }

      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon, back slash or forward slash. Just return the title. Write the title in ${
        inferTitleLanguage
      }. \nMessages:\n\n${JSON.stringify(messages)}`;

      const titleMessage = [
        {
          role: ROLE_USER,
          content: prompt,
        },
      ];

      const responseUrl = await requestUrl({
        url: DEFAULT_OPENAI_CONFIG.url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        contentType: "application/json",
        body: JSON.stringify({
          model: DEFAULT_OPENAI_CONFIG.model,
          messages: titleMessage,
          max_tokens: titleMaxTokens,
          temperature: titleTemperature,
        }),
        throw: false,
      });

      const response = responseUrl.text;
      const responseJSON = JSON.parse(response);
      return responseJSON.choices[0].message.content
        .replace(/[:/\\]/g, "")
        .replace("Title", "")
        .replace("title", "")
        .trim();
    } catch (err) {
      new Notice("[ChatGPT MD] Error inferring title from messages");
      throw new Error("[ChatGPT MD] Error inferring title from messages" + err);
    }
  }
}
