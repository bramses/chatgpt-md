import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiResponseParser } from "./ApiResponseParser";
import { ApiClient } from "./ApiClient";
import { StreamingResponse } from "./AiService";

/**
 * StreamingHandler manages streaming responses and editor manipulation
 * Separated from BaseAiService to follow Single Responsibility Principle
 */
export class StreamingHandler {
  private readonly apiResponseParser: ApiResponseParser;
  private readonly apiClient: ApiClient;

  constructor(apiResponseParser: ApiResponseParser, apiClient: ApiClient) {
    this.apiResponseParser = apiResponseParser;
    this.apiClient = apiClient;
  }

  /**
   * Handle streaming API call with editor manipulation
   */
  async handleStreamingCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    editor: Editor,
    headingPrefix: string,
    serviceType: string,
    payload: Record<string, any>,
    headers: Record<string, string>,
    setAtCursor?: boolean
  ): Promise<StreamingResponse> {
    try {
      // Insert assistant header
      const cursorPositions = this.apiResponseParser.insertAssistantHeader(
        editor, 
        headingPrefix, 
        payload.model
      );

      // Make streaming request using ApiClient
      const response = await this.apiClient.makeStreamingRequest(
        this.apiClient.getApiEndpoint(config, serviceType),
        payload,
        headers,
        serviceType
      );

      // Process the streaming response using ApiResponseParser
      const result = await this.apiResponseParser.processStreamResponse(
        response,
        serviceType,
        editor,
        cursorPositions,
        setAtCursor,
        this.apiClient as any // ApiClient has stopStreaming method
      );

      // Process the result
      return this.processStreamingResult(result);
    } catch (err) {
      // Return error message for the chat
      const errorMessage = `Error: ${err}`;
      return { fullString: errorMessage, mode: "streaming" };
    }
  }

  /**
   * Process streaming result and handle aborted case
   */
  private processStreamingResult(result: { text: string; wasAborted: boolean }): StreamingResponse {
    // If streaming was aborted and text is empty, return empty string with wasAborted flag
    if (result.wasAborted && result.text === "") {
      return { fullString: "", mode: "streaming", wasAborted: true };
    }

    // Normal case - return the text with wasAborted flag
    return {
      fullString: result.text,
      mode: "streaming",
      wasAborted: result.wasAborted,
    };
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.apiClient.stopStreaming();
  }
}