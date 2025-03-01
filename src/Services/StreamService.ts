import { Editor, Platform } from "obsidian";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER, ERROR_NO_CONNECTION } from "src/Constants";
import { OpenAIStreamPayload } from "src/Services/OpenAiService";
import { OllamaStreamPayload } from "src/Services/OllamaService";
import { OpenRouterStreamPayload } from "src/Services/OpenRouterService";
import { ErrorHandlingOptions, ErrorService } from "src/Services/ErrorService";
import { NotificationService } from "src/Services/NotificationService";
import { EditorUpdateService } from "./EditorUpdateService";

/**
 * Service responsible for streaming API communication
 */
export class StreamService {
  private abortController: AbortController | null = null;
  private errorService: ErrorService;
  private notificationService: NotificationService;
  private editorUpdateService: EditorUpdateService;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    editorUpdateService?: EditorUpdateService
  ) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.editorUpdateService = editorUpdateService || new EditorUpdateService(this.notificationService);
  }

  /**
   * Stream content from an API and update the editor
   */
  async stream(
    editor: Editor,
    url: string,
    options: OpenAIStreamPayload | OllamaStreamPayload | OpenRouterStreamPayload,
    headers: Record<string, string>,
    aiService: string,
    setAtCursor: boolean | undefined,
    headingPrefix: string
  ): Promise<string> {
    let txt = "";
    let initialCursor: { line: number; ch: number };

    try {
      console.log(`[ChatGPT MD] "stream"`, options);
      initialCursor = this.editorUpdateService.insertAssistantHeader(editor, headingPrefix, options.model);

      // Make the API request
      const response = await this.makeApiRequest(url, options, headers);

      // Handle HTTP status errors
      if (!response.ok) {
        return this.handleHttpError(response, aiService, options, editor, initialCursor, setAtCursor, url);
      }

      if (!response.body) {
        const errorMessage = this.errorService.handleApiError(new Error("The response was empty"), aiService, {
          returnForChat: true,
          showNotification: true,
          context: { model: options.model, url },
        });
        return this.editorUpdateService.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
      }

      // Process the stream
      txt = await this.processStream(response, aiService, editor, initialCursor, setAtCursor);
      return txt;
    } catch (error) {
      return this.handleStreamError(error, aiService, options, url, editor, initialCursor!, setAtCursor);
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Make the API request
   */
  private async makeApiRequest(
    url: string,
    options: OpenAIStreamPayload | OllamaStreamPayload | OpenRouterStreamPayload,
    headers: Record<string, string>
  ): Promise<Response> {
    this.abortController = new AbortController();

    return fetch(url, {
      headers,
      method: "POST",
      body: JSON.stringify(options),
      signal: this.abortController.signal,
    });
  }

  /**
   * Handle HTTP errors
   */
  private handleHttpError(
    response: Response,
    aiService: string,
    options: OpenAIStreamPayload | OllamaStreamPayload | OpenRouterStreamPayload,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor: boolean | undefined,
    url?: string
  ): string {
    let errorMessage: string;

    if (response.status === 401) {
      errorMessage = this.errorService.handleApiError({ status: 401 }, aiService, {
        returnForChat: true,
        showNotification: true,
        context: { model: options.model, url },
      });
    } else if (response.status === 404) {
      errorMessage = this.errorService.handleApiError({ status: 404 }, aiService, {
        returnForChat: true,
        showNotification: true,
        context: { model: options.model, url },
      });
    } else {
      errorMessage = this.errorService.handleApiError(
        { status: response.status, statusText: response.statusText },
        aiService,
        { returnForChat: true, showNotification: true, context: { model: options.model, url } }
      );
    }

    return this.editorUpdateService.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
  }

  /**
   * Process the stream response
   */
  private async processStream(
    response: Response,
    aiService: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor: boolean | undefined
  ): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let txt = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;

        if (aiService == AI_SERVICE_OPENAI || aiService == AI_SERVICE_OPENROUTER) {
          txt = this.processOpenAIFormat(line, txt, editor, aiService, initialCursor, setAtCursor);
          if (txt === "DONE") return this.editorUpdateService.finalizeText(editor, txt, initialCursor, setAtCursor);
        } else if (aiService == AI_SERVICE_OLLAMA) {
          txt = this.processOllamaFormat(line, txt, editor, initialCursor, setAtCursor);
          if (txt === "DONE") return this.editorUpdateService.finalizeText(editor, txt, initialCursor, setAtCursor);
        }
      }
    }

    return this.editorUpdateService.finalizeText(editor, txt, initialCursor, setAtCursor);
  }

  /**
   * Process OpenAI format stream data
   */
  private processOpenAIFormat(
    line: string,
    currentText: string,
    editor: Editor,
    aiService: string,
    initialCursor: { line: number; ch: number },
    setAtCursor: boolean | undefined
  ): string {
    if (!line.startsWith("data: ")) return currentText;

    const data = line.slice(6); // Remove "data: " prefix

    if (data === "[DONE]") {
      return this.editorUpdateService.finalizeText(editor, currentText, initialCursor, setAtCursor);
    }

    try {
      const payload = JSON.parse(data);
      const text = payload.choices[0].delta.content;
      if (text) {
        const cursor = editor.getCursor();
        this.editorUpdateService.updateEditorText(editor, text, cursor);
        return currentText + text;
      }
    } catch (error) {
      console.error(`Error parsing ${aiService} JSON:`, error);
    }

    return currentText;
  }

  /**
   * Process Ollama format stream data
   */
  private processOllamaFormat(
    line: string,
    currentText: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor: boolean | undefined
  ): string {
    try {
      const jsonData = JSON.parse(line);
      if (!jsonData.done) {
        const text = jsonData.message.content;
        if (text) {
          const cursor = editor.getCursor();
          this.editorUpdateService.updateEditorText(editor, text, cursor);
          return currentText + text;
        }
      } else {
        return this.editorUpdateService.finalizeText(editor, currentText, initialCursor, setAtCursor);
      }
    } catch (error) {
      console.error("Error parsing Ollama JSON:", error);
    }

    return currentText;
  }

  /**
   * Handle stream errors
   */
  private handleStreamError(
    error: any,
    aiService: string,
    options: OpenAIStreamPayload | OllamaStreamPayload | OpenRouterStreamPayload,
    url: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor: boolean | undefined
  ): string {
    // Handle different error types
    if (error.name === "AbortError") {
      console.log("[ChatGPT MD] Stream aborted");
      return this.editorUpdateService.finalizeText(editor, "Stream aborted", initialCursor, setAtCursor);
    }

    const errorOptions: ErrorHandlingOptions = {
      returnForChat: true,
      showNotification: true,
      context: { url, model: options.model },
    };

    if (error.message === ERROR_NO_CONNECTION) {
      const errorMessage = this.errorService.handleApiError(error, aiService, errorOptions);
      return this.editorUpdateService.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
    }

    // Handle generic errors
    console.error("Stream error:", error);
    const errorMessage = this.errorService.handleApiError(error, aiService, errorOptions);
    return this.editorUpdateService.finalizeText(editor, errorMessage, initialCursor, setAtCursor);
  }

  /**
   * Stop the current streaming operation
   */
  stopStreaming(): void {
    if (Platform.isMobile) {
      this.notificationService.showWarning("Mobile not supported.");
      return;
    }
    if (this.abortController) {
      this.abortController.abort();
      console.log("[ChatGPT MD] Stream aborted");
      this.abortController = null;
    }
  }
}
