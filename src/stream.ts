import { Editor, Notice, Platform } from "obsidian";
import { unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import { HORIZONTAL_LINE_MD } from "src/Constants";
import { OpenAIStreamPayload } from "src/Services/OpenAIService";
import { OllamaStreamPayload } from "src/Services/OllamaService";

const ASSISTANT_HEADER = (headingPrefix: string) => `\n\n${HORIZONTAL_LINE_MD}\n\n${headingPrefix}role::assistant\n\n`;

export class StreamManager {
  private abortController: AbortController | null = null;
  private manualClose = false;

  private handleEditorTextUpdate(editor: Editor, text: string, cursorPos: { line: number; ch: number }) {
    const convPos = editor.posToOffset(cursorPos);
    // @ts-ignore
    const cm6 = editor.cm;
    cm6.dispatch(
      cm6.state.update({
        changes: {
          from: convPos,
          to: convPos,
          insert: text,
        },
      })
    );

    const newCursor = {
      line: cursorPos.line,
      ch: cursorPos.ch + text.length,
    };
    editor.setCursor(newCursor);
    return newCursor;
  }

  private insertAssistantHeader(editor: Editor, headingPrefix: string) {
    const newLine = ASSISTANT_HEADER(headingPrefix);
    editor.replaceRange(newLine, editor.getCursor());

    const cursor = editor.getCursor();
    const newCursor = {
      line: cursor.line,
      ch: cursor.ch + newLine.length,
    };
    editor.setCursor(newCursor);
    return newCursor;
  }

  private finalizeText(editor: Editor, text: string, initialPos: { line: number; ch: number }, setAtCursor: boolean) {
    const finalText = unfinishedCodeBlock(text) ? text + "\n```" : text;

    const cursor = editor.getCursor();
    editor.replaceRange(
      finalText,
      {
        line: initialPos.line,
        ch: initialPos.ch,
      },
      cursor
    );

    const newCursor = {
      line: initialPos.line,
      ch: initialPos.ch + finalText.length,
    };
    editor.setCursor(newCursor);

    if (!setAtCursor) {
      editor.replaceRange("", newCursor, {
        line: Infinity,
        ch: Infinity,
      });
    } else {
      new Notice(
        "[ChatGPT MD] Text pasted at cursor may leave artifacts. Please remove them manually. ChatGPT MD cannot safely remove text when pasting at cursor."
      );
    }

    return finalText;
  }

  async stream(
    editor: Editor,
    url: string,
    options: OpenAIStreamPayload | OllamaStreamPayload,
    headers: Record<string, string>,
    isOpenAI: boolean,
    setAtCursor: boolean,
    headingPrefix: string
  ) {
    let txt = "";
    let initialCursor: { line: number; ch: number };

    try {
      console.log(`[ChatGPT MD] "stream"`, options);
      initialCursor = this.insertAssistantHeader(editor, headingPrefix);

      this.abortController = new AbortController();

      const response = await fetch(url, {
        headers,
        method: "POST",
        body: JSON.stringify(options),
        signal: this.abortController.signal,
      });

      if (!response.ok) throw new Error("Network response was not ok");
      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;

          if (isOpenAI) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6); // Remove "data: " prefix

            if (data === "[DONE]") {
              return this.finalizeText(editor, txt, initialCursor, setAtCursor);
            }

            try {
              const payload = JSON.parse(data);
              const text = payload.choices[0].delta.content;
              if (text) {
                const cursor = editor.getCursor();
                this.handleEditorTextUpdate(editor, text, cursor);
                txt += text;
              }
            } catch (error) {
              console.error("Error parsing OpenAI JSON:", error);
            }
          } else {
            try {
              const jsonData = JSON.parse(line);
              if (!jsonData.done) {
                const text = jsonData.message.content;
                if (text) {
                  const cursor = editor.getCursor();
                  this.handleEditorTextUpdate(editor, text, cursor);
                  txt += text;
                }
              } else {
                return this.finalizeText(editor, txt, initialCursor, setAtCursor);
              }
            } catch (error) {
              console.error("Error parsing Ollama JSON:", error);
            }
          }
        }
      }

      return txt;
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("[ChatGPT MD] Stream aborted");
        return this.finalizeText(editor, txt, initialCursor!, setAtCursor);
      }
      console.error("Stream error:", error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  stopStreaming = () => {
    if (Platform.isMobile) {
      new Notice("[ChatGPT MD] Mobile not supported.");
      return;
    }
    if (this.abortController) {
      this.manualClose = true;
      this.abortController.abort();
      console.log("[ChatGPT MD] Stream aborted");
      this.abortController = null;
    }
  };
}
