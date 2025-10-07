import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  ROLE_ASSISTANT,
  TRUNCATION_ERROR_FULL,
  TRUNCATION_ERROR_PARTIAL,
} from "src/Constants";
import { Editor } from "obsidian";
import { NotificationService } from "./NotificationService";
import { getHeaderRole } from "src/Utilities/TextHelpers";
import { ApiService } from "./ApiService";

/**
 * ApiResponseParser handles parsing of API responses
 * It centralizes response parsing logic for different API formats
 */
export class ApiResponseParser {
  private notificationService: NotificationService;
  private collectedCitations: Set<string> = new Set();

  // Time-based buffering properties
  private contentBuffer: string = "";
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private readonly FLUSH_INTERVAL_MS = 200; // 0.3 seconds
  private editor: Editor | null = null;
  private cursorPosition: { line: number; ch: number } | null = null;
  private setAtCursor: boolean = false;
  private isFlushing: boolean = false; // Prevent concurrent flushes

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
  }

  /**
   * Start the flush timer to periodically write buffer to editor
   */
  private startFlushTimer(editor: Editor, insertPosition: { line: number; ch: number }, setAtCursor?: boolean): void {
    this.editor = editor;
    this.cursorPosition = insertPosition; // Track where to insert content (after assistant header)
    this.setAtCursor = setAtCursor || false;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Flush the buffer to the editor
   * Inserts at tracked cursor position and updates it
   * Prevents concurrent flushes and handles errors gracefully
   */
  private flushBuffer(): void {
    // Skip if already flushing or nothing to flush
    if (this.isFlushing || !this.contentBuffer || !this.editor || !this.cursorPosition) {
      return;
    }

    try {
      this.isFlushing = true;

      if (this.setAtCursor) {
        this.editor.replaceSelection(this.contentBuffer);
      } else {
        try {
          // Insert at tracked cursor position (right after assistant header)
          this.editor.replaceRange(this.contentBuffer, this.cursorPosition);

          // Update cursor position using Obsidian's offset API
          // This correctly handles multi-line content
          const currentOffset = this.editor.posToOffset(this.cursorPosition);
          const newOffset = currentOffset + this.contentBuffer.length;
          this.cursorPosition = this.editor.offsetToPos(newOffset);
        } catch (error) {
          // Position became invalid - skip this flush
          console.warn("[ChatGPT MD] Flush skipped due to invalid position:", error);
          return; // Don't clear buffer - try again next time
        }
      }

      // Clear buffer after successful flush
      this.contentBuffer = "";
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stop the flush timer and perform final flush
   */
  private stopFlushTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush
    this.flushBuffer();

    // Update editor cursor to match the tracked position after all flushes
    if (this.editor && this.cursorPosition && !this.setAtCursor) {
      this.editor.setCursor(this.cursorPosition);
    }

    // Reset state (but keep cursorPosition for citations)
    this.editor = null;
    this.setAtCursor = false;
    this.isFlushing = false;
  }

  /**
   * Reset buffer state (used for aborts)
   */
  private resetBufferState(): void {
    this.contentBuffer = "";
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.editor = null;
    this.cursorPosition = null;
    this.setAtCursor = false;
    this.isFlushing = false;
  }

  /**
   * Add content to buffer (simple accumulation)
   */
  private addToBuffer(content: string): void {
    this.contentBuffer += content;
  }

  /**
   * Helper method to check choices and return appropriate response based on finish_reason
   */
  private handleChoicesWithFinishReason(choices: any[]): string | null {
    if (!choices || choices.length === 0) {
      return null;
    }

    const completeChoices = choices.filter((choice: any) => choice.finish_reason === "stop");
    const truncatedChoices = choices.filter((choice: any) => choice.finish_reason === "length");

    // If we have complete responses, use the first one
    if (completeChoices.length > 0) {
      const content = completeChoices[0].message?.content || "";
      // If some choices were truncated, add a warning
      if (truncatedChoices.length > 0) {
        return content + "\n\n" + TRUNCATION_ERROR_PARTIAL;
      }
      // All responses were complete
      return content;
    }

    // All choices were truncated
    if (truncatedChoices.length > 0) {
      return TRUNCATION_ERROR_FULL;
    }

    // Fallback to first choice if no specific finish_reason handling
    return choices[0].message?.content || "";
  }

  /**
   * Insert the assistant header at the current cursor position
   */
  insertAssistantHeader(
    editor: Editor,
    headingPrefix: string,
    model: string
  ): {
    initialCursor: { line: number; ch: number };
    newCursor: { line: number; ch: number };
  } {
    const newLine = getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
    const initialCursor = editor.getCursor();

    editor.replaceRange(newLine, initialCursor);

    // Calculate new cursor position using Obsidian's offset API
    const initialOffset = editor.posToOffset(initialCursor);
    const newCursor = editor.offsetToPos(initialOffset + newLine.length);

    editor.setCursor(newCursor);

    return { initialCursor, newCursor };
  }

  /**
   * Parse a non-streaming API response
   * @param data The response data
   * @param serviceType The AI service type
   * @returns The parsed content
   */
  parseNonStreamingResponse(data: any, serviceType: string): string {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
      case AI_SERVICE_OPENROUTER:
      case AI_SERVICE_LMSTUDIO:
        // Handle OpenAI-compatible services with finish_reason validation
        const result = this.handleChoicesWithFinishReason(data.choices);
        return result !== null ? result : "";
      case AI_SERVICE_ANTHROPIC:
        // Anthropic's response format has a content array
        if (data.content && Array.isArray(data.content)) {
          // Extract text content from the content array
          return data.content
            .filter((item: any) => item.type === "text")
            .map((item: any) => item.text)
            .join("");
        }
        return data.content || JSON.stringify(data);
      case AI_SERVICE_GEMINI:
        // Gemini's response format has candidates array with content parts
        if (data.candidates && data.candidates.length > 0) {
          const candidate = data.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            return candidate.content.parts
              .filter((part: any) => part.text)
              .map((part: any) => part.text)
              .join("");
          }
        }
        return data.text || JSON.stringify(data);
      case AI_SERVICE_OLLAMA:
        // Check for Ollama's chat API format which has a message object with content
        if (data.message && data.message.content) {
          return data.message.content;
        }
        // Check for Ollama's generate API format which has a response field
        if (data.response) {
          return data.response;
        }
        // Fallback to stringifying the data
        return JSON.stringify(data);
      default:
        console.warn(`Unknown service type: ${serviceType}`);
        // Check for OpenAI-like structure with finish_reason validation
        const defaultResult = this.handleChoicesWithFinishReason(data?.choices);
        if (defaultResult !== null) {
          return defaultResult;
        }
        return data?.response || JSON.stringify(data);
    }
  }

  /**
   * Process a streaming response line
   * @param line The response line
   * @param currentText The current accumulated text
   * @param serviceType The AI service type
   * @returns The updated text
   */
  processStreamLine(
    line: string,
    currentText: string,
    serviceType: string
  ): string {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
      case AI_SERVICE_OPENROUTER:
      case AI_SERVICE_LMSTUDIO:
        return this.processOpenAIFormat(line, currentText);
      case AI_SERVICE_ANTHROPIC:
        return this.processAnthropicFormat(line, currentText);
      case AI_SERVICE_GEMINI:
        return this.processGeminiFormat(line, currentText);
      case AI_SERVICE_OLLAMA:
        return this.processOllamaFormat(line, currentText);
      default:
        console.warn(`Unknown service type for streaming: ${serviceType}`);
        return currentText;
    }
  }

  /**
   * Process Anthropic format streaming response
   */
  private processAnthropicFormat(line: string, currentText: string): string {
    if (line.trim() === "") return currentText;

    try {
      // Anthropic's streaming format starts with "event: " followed by the event type
      if (line.startsWith("event: ")) {
        return currentText; // Skip event lines
      }

      // Data lines start with "data: "
      if (line.startsWith("data: ")) {
        const payloadString = line.substring("data: ".length).trimStart();

        // Check for the [DONE] marker
        if (payloadString === "[DONE]") {
          return currentText;
        }

        try {
          const json = JSON.parse(payloadString);

          // Handle content delta
          if (json.type === "content_block_delta") {
            if (json.delta && json.delta.text) {
              // Add content to buffer
              this.addToBuffer(json.delta.text);
              return currentText + json.delta.text;
            }
          }
          // Handle content block start (contains the initial text)
          else if (json.type === "content_block_start") {
            if (json.content_block && json.content_block.type === "text" && json.content_block.text) {
              // Add content to buffer
              this.addToBuffer(json.content_block.text);
              return currentText + json.content_block.text;
            }
          }
        } catch (e) {
          // Skip lines that aren't valid JSON
          console.error("Error parsing Anthropic JSON:", e);
        }
      }

      return currentText;
    } catch (_) {
      // Skip lines that cause errors
      return currentText;
    }
  }

  /**
   * Process OpenAI format streaming response
   */
  private processOpenAIFormat(line: string, currentText: string): string {
    if (line.trim() === "") return currentText;

    try {
      // Robustly extract JSON payload from SSE data line
      const payloadString = line.substring("data:".length).trimStart();
      const json = JSON.parse(payloadString);

      // Collect citations if they exist in this chunk
      if (json.citations && json.citations.length > 0) {
        for (const citation of json.citations) {
          this.collectedCitations.add(citation);
        }
      }

      if (json.choices && json.choices.length > 0) {
        // Check if any choices have finish_reason (this usually comes in the final chunk)
        const finishedChoices = json.choices.filter((choice: any) => choice.finish_reason);

        if (finishedChoices.length > 0) {
          const completeChoices = finishedChoices.filter((choice: any) => choice.finish_reason === "stop");
          const truncatedChoices = finishedChoices.filter((choice: any) => choice.finish_reason === "length");

          // Handle truncation - add error message to buffer
          if (truncatedChoices.length > 0) {
            let errorMessage;
            if (completeChoices.length > 0) {
              errorMessage = "\n\n" + TRUNCATION_ERROR_PARTIAL;
            } else {
              errorMessage = "\n\n" + TRUNCATION_ERROR_FULL;
            }
            this.addToBuffer(errorMessage);
            return currentText + errorMessage;
          }
        }

        // Handle content in the first choice's delta if it exists
        if (json.choices[0]) {
          const { delta } = json.choices[0];
          if (delta && delta.content) {
            // Add content to buffer
            this.addToBuffer(delta.content);
            return currentText + delta.content;
          }
        }
      }

      return currentText;
    } catch (_) {
      // Skip lines that aren't valid JSON or don't contain content
      return currentText;
    }
  }

  /**
   * Process Ollama format streaming response
   */
  private processOllamaFormat(line: string, currentText: string): string {
    if (line.trim() === "") return currentText;

    try {
      const json = JSON.parse(line);

      // Check for Ollama's chat API format which has a message object with content
      if (json.message && json.message.content) {
        const content = json.message.content;
        // Add content to buffer
        this.addToBuffer(content);
        return currentText + content;
      }

      // Check for Ollama's generate API format which has a response field
      if (json.response) {
        // Add content to buffer
        this.addToBuffer(json.response);
        return currentText + json.response;
      }

      return currentText;
    } catch (_) {
      // Skip lines that aren't valid JSON or don't contain content
      return currentText;
    }
  }

  /**
   * Process Gemini format streaming response
   */
  private processGeminiFormat(line: string, currentText: string): string {
    if (line.trim() === "") return currentText;

    try {
      // With alt=sse, Gemini uses SSE format like OpenAI
      // Extract JSON payload from SSE data line
      const payloadString = line.substring("data:".length).trimStart();

      // Check for the [DONE] marker
      if (payloadString === "[DONE]") {
        return currentText;
      }

      const json = JSON.parse(payloadString);

      // Handle Gemini's streaming response format
      if (json.candidates && json.candidates.length > 0) {
        const candidate = json.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          // Extract text content from the parts array
          const content = candidate.content.parts
            .filter((part: any) => part.text)
            .map((part: any) => part.text)
            .join("");

          if (content) {
            // Add content to buffer
            this.addToBuffer(content);
            return currentText + content;
          }
        }
      }

      return currentText;
    } catch (e) {
      // Log parsing errors for debugging
      console.error("Error parsing Gemini JSON:", e, "Line:", line);
      return currentText;
    }
  }

  /**
   * Process a complete streaming response
   * @param response The response object
   * @param serviceType The AI service type
   * @param editor The editor instance
   * @param initialCursor The initial cursor position before inserting the assistant header
   * @param setAtCursor Whether to set the text at cursor
   * @param apiService The API service instance to check if streaming was aborted
   * @returns The complete text and whether streaming was aborted
   */
  async processStreamResponse(
    response: Response,
    serviceType: string,
    editor: Editor,
    cursorPositions: {
      initialCursor: { line: number; ch: number };
      newCursor: { line: number; ch: number };
    },
    setAtCursor?: boolean,
    apiService?: ApiService
  ): Promise<{ text: string; wasAborted: boolean }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let text = "";
    let wasAborted = false;

    // Start the flush timer for time-based buffering
    this.startFlushTimer(editor, cursorPositions.newCursor, setAtCursor);

    try {
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: [DONE]")) continue;
          if (line.startsWith("data:")) {
            text = this.processStreamLine(line, text, serviceType);
          } else if (line.trim() !== "") {
            // For Gemini, Ollama and other non-SSE formats that send raw JSON
            text = this.processStreamLine(line, text, serviceType);
          }
        }
      }
    } catch (_) {
      // console.error("Error processing stream:", error);
    } finally {
      // Stop timer and perform final flush
      this.stopFlushTimer();
    }

    if (apiService && apiService.wasAborted()) {
      wasAborted = true;
      apiService.resetAbortedFlag();

      this.resetBufferState();

      if (!setAtCursor) {
        editor.replaceRange("", cursorPositions.initialCursor, editor.getCursor());
      }

      return { text: "", wasAborted };
    }

    if (this.collectedCitations.size > 0) {
      const citations = Array.from(this.collectedCitations);

      const citationsText =
        "\n\n**Sources:**\n" +
        citations
          .map((citation: string, index: number) => {
            return `${index + 1}. [${citation}](${citation})`;
          })
          .join("\n");

      if (setAtCursor) {
        editor.replaceSelection(citationsText);
      } else {
        // Insert citations at current cursor using offset API
        const cursor = editor.getCursor();
        editor.replaceRange(citationsText, cursor);
        const newCursor = editor.offsetToPos(editor.posToOffset(cursor) + citationsText.length);
        editor.setCursor(newCursor);
      }

      text += citationsText;

      this.collectedCitations.clear();
    }

    return { text, wasAborted };
  }
}
