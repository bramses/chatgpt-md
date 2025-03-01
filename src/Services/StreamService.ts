import { Editor } from "obsidian";
import { OpenAIStreamPayload } from "src/Services/OpenAiService";
import { OllamaStreamPayload } from "src/Services/OllamaService";
import { OpenRouterStreamPayload } from "src/Services/OpenRouterService";
import { ErrorService } from "src/Services/ErrorService";
import { NotificationService } from "src/Services/NotificationService";
import { EditorUpdateService } from "./EditorUpdateService";
import { ApiService } from "./ApiService";
import { ApiResponseParser } from "./ApiResponseParser";

/**
 * Service responsible for streaming API communication
 * @deprecated Use ApiService, ApiResponseParser instead
 */
export class StreamService {
  private apiService: ApiService;
  private apiResponseParser: ApiResponseParser;
  private errorService: ErrorService;
  private notificationService: NotificationService;
  private editorUpdateService: EditorUpdateService;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    editorUpdateService?: EditorUpdateService,
    apiService?: ApiService,
    apiResponseParser?: ApiResponseParser
  ) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.editorUpdateService = editorUpdateService || new EditorUpdateService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiResponseParser =
      apiResponseParser || new ApiResponseParser(this.editorUpdateService, this.notificationService);
  }

  /**
   * Stream content from an API and update the editor
   * @deprecated Use ApiService.makeStreamingRequest and ApiResponseParser.processStreamResponse instead
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
    try {
      console.log(`[ChatGPT MD] "stream" (via StreamService)`, options);

      // Insert assistant header
      const initialCursor = this.editorUpdateService.insertAssistantHeader(editor, headingPrefix, options.model);

      // Make the API request using ApiService
      const response = await this.apiService.makeStreamingRequest(url, options, headers, aiService);

      // Process the stream using ApiResponseParser
      return await this.apiResponseParser.processStreamResponse(
        response,
        aiService,
        editor,
        initialCursor,
        setAtCursor
      );
    } catch (error) {
      // Handle the error and update the editor
      const errorMessage = this.errorService.handleApiError(error, aiService, {
        returnForChat: true,
        showNotification: true,
        context: { model: options.model, url },
      });

      // Update the editor with the error message
      this.editorUpdateService.finalizeText(editor, errorMessage, editor.getCursor(), setAtCursor);

      return errorMessage;
    }
  }

  /**
   * Stop any ongoing streaming request
   */
  stopStreaming(): void {
    this.apiService.stopStreaming();
  }
}
