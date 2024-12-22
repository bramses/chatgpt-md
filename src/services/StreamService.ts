import { Editor, Notice } from "obsidian";
import { SSE } from "sse";
import { ChatMDFrontMatter } from "../models/ChatSettingsModel";
import { unfinishedCodeBlock } from "../utils/helpers";

export class StreamService {
  private sse: any | null = null;
  private manualClose = false;

  stopStreaming() {
    if (this.sse) {
      this.manualClose = true;
      this.sse.close();
      console.log("[ChatGPT MD] SSE manually closed");
      this.sse = null;
    }
  }

  async streamMessages(
    editor: Editor,
    apiKey: string,
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log("[ChatGPT MD] streamMessages", frontmatter);

        const source = new SSE(frontmatter.url, {
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

        this.sse = source;

        let txt = "";
        let initialCursorPosCh = editor.getCursor().ch;
        let initialCursorPosLine = editor.getCursor().line;

        source.addEventListener("open", () => {
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

        source.addEventListener("message", (e: any) => {
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
            source.close();
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

            resolve();
          }
        });

        source.addEventListener("abort", () => {
          console.log("[ChatGPT MD] SSE Closed Event");

          if (this.manualClose) {
            resolve();
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
  }
}
