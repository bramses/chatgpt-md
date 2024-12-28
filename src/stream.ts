import { Editor, Notice, Platform } from "obsidian";
import { SSE } from "sse";

import { unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import { Message } from "src/Models/Message";
import { HORIZONTAL_LINE_MD } from "src/Constants";

export interface OpenAIStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  stop: string[] | null;
  n: number;
  logit_bias?: any | null;
  user?: string | null;
  max_tokens: number;
  stream: boolean;
}

export class StreamManager {
  sse: any | null = null;
  manualClose = false;

  constructor() {}

  stopStreaming = () => {
    if (Platform.isMobile) {
      new Notice("[ChatGPT MD] Mobile not supported.");
      return;
    }
    if (this.sse) {
      this.manualClose = true;
      this.sse.close();
      console.log("[ChatGPT MD] SSE manually closed");
      this.sse = null;
    }
  };

  streamSSE = async (
    editor: Editor,
    apiKey: string,
    url: string,
    options: OpenAIStreamPayload,
    setAtCursor: boolean,
    headingPrefix: string
  ) => {
    return new Promise((resolve, reject) => {
      try {
        console.log("[ChatGPT MD] streamSSE", options);

        const source = new SSE(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          method: "POST",
          payload: JSON.stringify(options),
        });

        this.sse = source;

        let txt = "";
        let initialCursorPosCh = editor.getCursor().ch;
        let initialCursorPosLine = editor.getCursor().line;

        source.addEventListener("open", (e: any) => {
          console.log("[ChatGPT MD] SSE Opened");

          const newLine = `\n\n${HORIZONTAL_LINE_MD}\n\n${headingPrefix}role::assistant\n\n`;
          editor.replaceRange(newLine, editor.getCursor());

          // move cursor to end of line
          const cursor = editor.getCursor();
          const newCursor = {
            line: cursor.line,
            ch: cursor.ch + newLine.length,
          };
          editor.setCursor(newCursor);

          initialCursorPosCh = newCursor.ch;
          initialCursorPosLine = newCursor.line;
        });

        source.addEventListener("message", (e: any) => {
          if (e.data != "[DONE]") {
            const payload = JSON.parse(e.data);
            const text = payload.choices[0].delta.content;

            // if text undefined, then do nothing
            if (!text) {
              return;
            }

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
            source.close();
            console.log("[ChatGPT MD] SSE Closed");

            if (unfinishedCodeBlock(txt)) {
              txt += "\n```";
            }

            // replace the text from initialCursor to fix any formatting issues from streaming
            const cursor = editor.getCursor();
            editor.replaceRange(
              txt,
              {
                line: initialCursorPosLine,
                ch: initialCursorPosCh,
              },
              cursor
            );

            // set cursor to end of replacement text
            const newCursor = {
              line: initialCursorPosLine,
              ch: initialCursorPosCh + txt.length,
            };
            editor.setCursor(newCursor);

            if (!setAtCursor) {
              // remove the text after the cursor
              editor.replaceRange("", newCursor, {
                line: Infinity,
                ch: Infinity,
              });
            } else {
              new Notice(
                "[ChatGPT MD] Text pasted at cursor may leave artifacts. Please remove them manually. ChatGPT MD cannot safely remove text when pasting at cursor."
              );
            }

            resolve(txt);
            // return txt;
          }
        });

        source.addEventListener("abort", (e: any) => {
          console.log("[ChatGPT MD] SSE Closed Event");

          // if e was triggered by stopStreaming, then resolve
          if (this.manualClose) {
            resolve(txt);
          }
        });

        source.addEventListener("error", (e: any) => {
          try {
            console.log("[ChatGPT MD] SSE Error: ", JSON.parse(e.data));
            source.close();
            console.log("[ChatGPT MD] SSE Closed");
            reject(JSON.parse(e.data));
          } catch (err) {
            console.log("[ChatGPT MD] Unknown Error: ", e);
            source.close();
            console.log("[ChatGPT MD] SSE Closed");
            reject(e);
          }
        });

        source.stream();
      } catch (err) {
        console.log("SSE Error", err);
        reject(err);
      }
    });
  };
}
