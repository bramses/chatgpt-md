import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { Editor } from "obsidian";
import { EditorUpdateService } from "./EditorUpdateService";
import { NotificationService } from "./NotificationService";
import { unfinishedCodeBlock } from "src/Utilities/TextHelpers";

/**
 * ApiResponseParser handles parsing of API responses
 * It centralizes response parsing logic for different API formats
 */
export class ApiResponseParser {
  private editorUpdateService: EditorUpdateService;
  private notificationService: NotificationService;

  constructor(editorUpdateService?: EditorUpdateService, notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
    this.editorUpdateService = editorUpdateService || new EditorUpdateService(this.notificationService);
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
        return data.choices[0].message.content;
      case AI_SERVICE_OPENROUTER:
        return data.choices[0].message.content;
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
        return data?.choices?.[0]?.message?.content || data?.response || JSON.stringify(data);
    }
  }

  /**
   * Process a streaming response line
   * @param line The response line
   * @param currentText The current accumulated text
   * @param editor The editor instance
   * @param initialCursor The initial cursor position
   * @param serviceType The AI service type
   * @param setAtCursor Whether to set the text at cursor
   * @returns The updated text
   */
  processStreamLine(
    line: string,
    currentText: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    serviceType: string,
    setAtCursor?: boolean
  ): string {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
      case AI_SERVICE_OPENROUTER:
        return this.processOpenAIFormat(line, currentText, editor, initialCursor, setAtCursor);
      case AI_SERVICE_OLLAMA:
        return this.processOllamaFormat(line, currentText, editor, initialCursor, setAtCursor);
      default:
        console.warn(`Unknown service type for streaming: ${serviceType}`);
        return currentText;
    }
  }

  /**
   * Process OpenAI format streaming response
   */
  private processOpenAIFormat(
    line: string,
    currentText: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor?: boolean
  ): string {
    if (line.trim() === "") return currentText;

    try {
      const json = JSON.parse(line.replace("data: ", ""));

      if (json.choices && json.choices[0]) {
        const { delta } = json.choices[0];

        if (delta && delta.content) {
          // Only update the editor with the new delta content, not the full text
          if (setAtCursor) {
            editor.replaceSelection(delta.content);
          } else {
            // Insert just the new content at the current cursor position
            const cursor = editor.getCursor();
            editor.replaceRange(delta.content, cursor);
            // Move the cursor to the end of the inserted text
            editor.setCursor({
              line: cursor.line,
              ch: cursor.ch + delta.content.length,
            });
          }

          // Return the accumulated text for tracking
          return currentText + delta.content;
        }
      }

      return currentText;
    } catch (e) {
      // Skip lines that aren't valid JSON or don't contain content
      return currentText;
    }
  }

  /**
   * Process Ollama format streaming response
   */
  private processOllamaFormat(
    line: string,
    currentText: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor?: boolean
  ): string {
    if (line.trim() === "") return currentText;

    try {
      const json = JSON.parse(line);

      // Check for Ollama's chat API format which has a message object with content
      if (json.message && json.message.content) {
        const content = json.message.content;

        // Only update the editor with the new content, not the full text
        if (setAtCursor) {
          editor.replaceSelection(content);
        } else {
          // Insert just the new content at the current cursor position
          const cursor = editor.getCursor();
          editor.replaceRange(content, cursor);
          // Move the cursor to the end of the inserted text
          editor.setCursor({
            line: cursor.line,
            ch: cursor.ch + content.length,
          });
        }

        // Return the accumulated text for tracking
        return currentText + content;
      }

      // Check for Ollama's generate API format which has a response field
      if (json.response) {
        // Only update the editor with the new response content, not the full text
        if (setAtCursor) {
          editor.replaceSelection(json.response);
        } else {
          // Insert just the new content at the current cursor position
          const cursor = editor.getCursor();
          editor.replaceRange(json.response, cursor);
          // Move the cursor to the end of the inserted text
          editor.setCursor({
            line: cursor.line,
            ch: cursor.ch + json.response.length,
          });
        }

        // Return the accumulated text for tracking
        return currentText + json.response;
      }

      return currentText;
    } catch (e) {
      // Skip lines that aren't valid JSON or don't contain content
      return currentText;
    }
  }

  /**
   * Process a complete streaming response
   * @param response The response object
   * @param serviceType The AI service type
   * @param editor The editor instance
   * @param initialCursor The initial cursor position
   * @param setAtCursor Whether to set the text at cursor
   * @returns The complete text
   */
  async processStreamResponse(
    response: Response,
    serviceType: string,
    editor: Editor,
    initialCursor: { line: number; ch: number },
    setAtCursor?: boolean
  ): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let text = "";

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
            text = this.processStreamLine(line, text, editor, initialCursor, serviceType, setAtCursor);
          } else if (line.trim() !== "") {
            // For Ollama and other non-OpenAI formats
            text = this.processStreamLine(line, text, editor, initialCursor, serviceType, setAtCursor);
          }
        }
      }

      // Check for unfinished code blocks and add closing backticks if needed
      if (unfinishedCodeBlock(text)) {
        // Add closing code block
        const cursor = editor.getCursor();
        editor.replaceRange("\n```", cursor);
        text += "\n```";
      }

      // Clean up any trailing content if not setting at cursor
      if (!setAtCursor) {
        const cursor = editor.getCursor();
        editor.replaceRange("", cursor, {
          line: Infinity,
          ch: Infinity,
        });
      }

      return text;
    } catch (error) {
      console.error("Error processing stream:", error);
      return text;
    }
  }
}
