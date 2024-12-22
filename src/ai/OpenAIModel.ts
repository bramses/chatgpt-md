import { AIModel } from "./AIModel";
import { ChatMDFrontMatter } from "../models/ChatSettingsModel";
import { requestUrl, Notice } from "obsidian";
import { SSE } from "sse";
import { unfinishedCodeBlock } from "../utils/helpers";
import { Editor } from "codemirror"; // Adjust based on your setup

export class OpenAIModel implements AIModel {
  id: string = "openai";
  name: string = "OpenAI";

  private sse: any | null = null;
  private manualClose: boolean = false;

  constructor(
    private settings: any,
    private apiKey: string
  ) {}

  async callAPI(
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[],
    apiKey: string
  ): Promise<string> {
    try {
      const response = await requestUrl({
        url: frontmatter.url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: frontmatter.model,
          messages: messages,
          max_tokens: frontmatter.max_tokens,
          temperature: frontmatter.temperature,
          top_p: frontmatter.top_p,
          presence_penalty: frontmatter.presence_penalty,
          frequency_penalty: frontmatter.frequency_penalty,
          n: frontmatter.n,
          stop: frontmatter.stop,
        }),
        throw: false,
      });

      const responseJSON = JSON.parse(response.text);
      if (responseJSON.choices && responseJSON.choices.length > 0) {
        return responseJSON.choices[0].message.content;
      } else {
        throw new Error("No valid response from API");
      }
    } catch (error) {
      console.error("Error calling OpenAI API: ", error);
      throw new Error("Failed to communicate with OpenAI API");
    }
  }

  async stream(
    editor: any,
    apiKey: string,
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log("[ChatGPT MD] streamMessages", frontmatter);

        this.sse = new SSE(frontmatter.url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          method: "POST",
          payload: JSON.stringify({
            model: frontmatter.model,
            messages: messages,
            max_tokens: frontmatter.max_tokens,
            temperature: frontmatter.temperature,
            top_p: frontmatter.top_p,
            presence_penalty: frontmatter.presence_penalty,
            frequency_penalty: frontmatter.frequency_penalty,
            stream: true,
            stop: frontmatter.stop,
            n: frontmatter.n,
          }),
        });

        let txt = "";
        let initialCursorPosCh = editor.getCursor().ch;
        let initialCursorPosLine = editor.getCursor().line;

        this.sse.addEventListener("open", () => {
          console.log("[ChatGPT MD] SSE Opened");
          const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::assistant\n\n`;
          editor.replaceRange(newLine, editor.getCursor());

          const cursor = editor.getCursor();
          const newCursor = {
            line: cursor.line,
            ch: cursor.ch + newLine.length,
          };
          editor.setCursor(newCursor);

          initialCursorPosCh = newCursor.ch;
          initialCursorPosLine = newCursor.line;
        });

        this.sse.addEventListener("message", (e: any) => {
          if (e.data !== "[DONE]") {
            const payload = JSON.parse(e.data);
            const text = payload.choices[0].delta.content;

            if (!text) return;

            const cursor = editor.getCursor();
            const convPos = editor.posToOffset(cursor);

            // @ts-ignore
            const cm6 = editor.cm;
            const transaction = cm6.state.update({
              changes: {
                from: convPos,
                to: convPos,
                insert: text,
              },
            });
            cm6.dispatch(transaction);

            txt += text;

            const newCursor = {
              line: cursor.line,
              ch: cursor.ch + text.length,
            };
            editor.setCursor(newCursor);
          } else {
            this.sse?.close();
            console.log("[ChatGPT MD] SSE Closed");

            if (unfinishedCodeBlock(txt)) {
              txt += "\n```";
            }

            const cursor = editor.getCursor();
            editor.replaceRange(
              txt,
              {
                line: initialCursorPosLine,
                ch: initialCursorPosCh,
              },
              cursor
            );

            const newCursor = {
              line: initialCursorPosLine,
              ch: initialCursorPosCh + txt.length,
            };
            editor.setCursor(newCursor);

            const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n`;
            editor.replaceRange(newLine, editor.getCursor());
            const cursorAfterNewLine = editor.getCursor();
            const newCursorAfterNewline = {
              line: cursorAfterNewLine.line,
              ch: cursorAfterNewLine.ch + newLine.length,
            };
            editor.setCursor(newCursorAfterNewline);

            resolve();
          }
        });

        this.sse.addEventListener("abort", () => {
          console.log("[ChatGPT MD] SSE Closed Event");
          if (this.manualClose) {
            resolve();
          }
        });

        this.sse.addEventListener("error", (e: any) => {
          try {
            console.log("[ChatGPT MD] SSE Error: ", JSON.parse(e.data));
            this.sse?.close();
            console.log("[ChatGPT MD] SSE Closed");
            reject(JSON.parse(e.data));
          } catch (err) {
            console.log("[ChatGPT MD] Unknown Error: ", e);
            this.sse?.close();
            console.log("[ChatGPT MD] SSE Closed");
            reject(e);
          }
        });

        this.sse.stream();
      } catch (err) {
        console.log("SSE Error", err);
        reject(err);
      }
    });
  }

  stopStreaming(): void {
    if (this.sse) {
      this.manualClose = true;
      this.sse.close();
      console.log("[ChatGPT MD] SSE manually closed");
      this.sse = null;
      new Notice("Streaming has been stopped.");
    } else {
      new Notice("No active streaming to stop.");
    }
  }
  async inferTitle(
    messages: { role: string; content: string }[],
    language: string
  ): Promise<string> {
    try {
      if (messages.length < 2) {
        throw new Error("Not enough messages to infer title.");
      }

      const promptMessages = [
        {
          role: "system",
          content: `Infer a title in ${language} based on the following messages. The title **cannot** contain any of the following characters: colon, backslash, or forward slash. Just return the title.`,
        },
        ...messages,
      ];

      const response = await this.callAPI(
        {
          temperature: 0.0,
          top_p: 1,
          presence_penalty: 0,
          frequency_penalty: 0,
          model: this.settings.model,
          max_tokens: 50,
          stream: false,
          stop: null,
          n: 1,
          logit_bias: null,
          user: null,
          system_commands: null,
          url: this.settings.stream ? "" : this.settings.url,
        },
        promptMessages,
        this.apiKey
      );
      const cleanedTitle = response
        .replace(/[:\\/]/g, "")
        .replace(/Title/i, "")
        .trim();
      return cleanedTitle;
    } catch (error) {
      console.error("Error inferring title: ", error);
      new Notice("Failed to infer title.");
      throw error;
    }
  }

  async moveToChat(editor: any, view: any): Promise<void> {
    // Implementation if needed
  }

  async chooseChatTemplate(editor: any, view: any): Promise<void> {
    // Implementation if needed
  }
}
