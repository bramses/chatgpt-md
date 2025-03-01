import { Editor, Platform } from "obsidian";
import { getHeaderRole, unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import {
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  ERROR_NO_CONNECTION,
  ROLE_ASSISTANT,
} from "src/Constants";
import { OpenAIStreamPayload } from "src/Services/OpenAiService";
import { OllamaStreamPayload } from "src/Services/OllamaService";
import { OpenRouterStreamPayload } from "src/Services/OpenRouterService";
import { ErrorHandlingOptions, ErrorService } from "src/Services/ErrorService";
import { NotificationService } from "src/Services/NotificationService";

export class StreamManager {
  private abortController: AbortController | null = null;
  private errorService: ErrorService;
  private notificationService: NotificationService;

  constructor(errorService?: ErrorService, notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
  }

  private handleEditorTextUpdate(editor: Editor, newText: string, cursorPosition: { line: number; ch: number }) {
    const updatedPosition = editor.posToOffset(cursorPosition);

    // @ts-ignore
    const codeMirrorInstance = editor.cm;
    codeMirrorInstance.dispatch(
      codeMirrorInstance.state.update({
        changes: {
          from: updatedPosition,
          to: updatedPosition,
          insert: newText,
        },
      })
    );

    const newCursorPosition = {
      line: cursorPosition.line,
      ch: cursorPosition.ch + newText.length,
    };
    editor.setCursor(newCursorPosition);
    return newCursorPosition;
  }

  private insertAssistantHeader(editor: Editor, headingPrefix: string, model: string) {
    const newLine = getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);

    editor.replaceRange(newLine, editor.getCursor());

    const cursor = editor.getCursor();
    const newCursor = {
      line: cursor.line,
      ch: cursor.ch + newLine.length,
    };
    editor.setCursor(newCursor);
    return newCursor;
  }

  private finalizeText(
    editor: Editor,
    text: string,
    initialPos: {
      line: number;
      ch: number;
    },
    setAtCursor: undefined | boolean
  ) {
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
      this.notificationService.showWarning(
        "Text pasted at cursor may leave artifacts. Please remove them manually. ChatGPT MD cannot safely remove text when pasting at cursor."
      );
    }

    return finalText;
  }

  async stream(
    editor: Editor,
    url: string,
    options: OpenAIStreamPayload | OllamaStreamPayload | OpenRouterStreamPayload,
    headers: Record<string, string>,
    aiService: string,
    setAtCursor: boolean | undefined,
    headingPrefix: string
  ) {
    let txt = "";
    let initialCursor: { line: number; ch: number };

    try {
      console.log(`[ChatGPT MD] "stream"`, options);
      initialCursor = this.insertAssistantHeader(editor, headingPrefix, options.model);

      this.abortController = new AbortController();

      const response = await fetch(url, {
        headers,
        method: "POST",
        body: JSON.stringify(options),
        signal: this.abortController.signal,
      });

      // Handle HTTP status errors
      if (response.status === 401) {
        const errorMessage = this.errorService.handleApiError({ status: 401 }, aiService, {
          returnForChat: true,
          showNotification: true,
          context: { model: options.model, url },
        });
        return this.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
      } else if (response.status === 404) {
        const errorMessage = this.errorService.handleApiError({ status: 404 }, aiService, {
          returnForChat: true,
          showNotification: true,
          context: { model: options.model, url },
        });
        return this.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
      } else if (!response.ok) {
        const errorMessage = this.errorService.handleApiError(
          { status: response.status, statusText: response.statusText },
          aiService,
          { returnForChat: true, showNotification: true, context: { model: options.model, url } }
        );
        return this.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
      }

      if (!response.body) {
        const errorMessage = this.errorService.handleApiError(new Error("The response was empty"), aiService, {
          returnForChat: true,
          showNotification: true,
          context: { model: options.model, url },
        });
        return this.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;

          if (aiService == AI_SERVICE_OPENAI || aiService == AI_SERVICE_OPENROUTER) {
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
              console.error(`Error parsing ${aiService} JSON:`, error);
            }
          } else if (aiService == AI_SERVICE_OLLAMA) {
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
      // Handle different error types
      if (error.name === "AbortError") {
        console.log("[ChatGPT MD] Stream aborted");
        return this.finalizeText(editor, "Stream aborted", initialCursor!, setAtCursor);
      }

      const errorOptions: ErrorHandlingOptions = {
        returnForChat: true,
        showNotification: true,
        context: { url, model: options.model },
      };

      if (error.message === ERROR_NO_CONNECTION) {
        const errorMessage = this.errorService.handleApiError(error, aiService, errorOptions);
        return this.finalizeText(editor, errorMessage, initialCursor!, setAtCursor);
      }

      // Handle generic errors
      console.error("Stream error:", error);
      const errorMessage = this.errorService.handleApiError(error, aiService, errorOptions);
      return this.finalizeText(editor, errorMessage, initialCursor!, setAtCursor);
    } finally {
      this.abortController = null;
    }
  }

  stopStreaming = () => {
    if (Platform.isMobile) {
      this.notificationService.showWarning("Mobile not supported.");
      return;
    }
    if (this.abortController) {
      this.abortController.abort();
      console.log("[ChatGPT MD] Stream aborted");
      this.abortController = null;
    }
  };
}
