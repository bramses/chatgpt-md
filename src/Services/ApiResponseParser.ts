import {
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  ROLE_ASSISTANT,
} from "src/Constants";
import { Editor } from "obsidian";
import { NotificationService } from "./NotificationService";
import { getHeaderRole, unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import { ApiService } from "./ApiService";

/**
 * ApiResponseParser handles parsing of API responses
 * It centralizes response parsing logic for different API formats
 */
export class ApiResponseParser {
  private notificationService: NotificationService;
  private collectedCitations: Set<string> = new Set();

  // Table buffering properties
  private tableBuffer: string = "";
  private isInTable: boolean = false;
  private tableStartPosition: { line: number; ch: number } | null = null;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
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

    // Store the initial cursor position before inserting the header
    const initialCursor = {
      line: editor.getCursor().line,
      ch: editor.getCursor().ch,
    };

    editor.replaceRange(newLine, initialCursor);

    const newCursor = {
      line: initialCursor.line,
      ch: initialCursor.ch + newLine.length,
    };
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
        return data.choices[0].message.content;
      case AI_SERVICE_OPENROUTER:
        return data.choices[0].message.content;
      case AI_SERVICE_LMSTUDIO:
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
      case AI_SERVICE_LMSTUDIO:
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
      // Robustly extract JSON payload from SSE data line
      const payloadString = line.substring("data:".length).trimStart();
      const json = JSON.parse(payloadString);

      // Collect citations if they exist in this chunk
      if (json.citations && json.citations.length > 0) {
        for (const citation of json.citations) {
          this.collectedCitations.add(citation);
        }
      }

      if (json.choices && json.choices[0]) {
        const { delta } = json.choices[0];

        // Handle content in delta if it exists
        if (delta && delta.content) {
          // Use table buffering logic to handle content
          return this.processContentWithTableBuffering(delta.content, currentText, editor, setAtCursor);
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

        // Use table buffering logic to handle content
        return this.processContentWithTableBuffering(content, currentText, editor, setAtCursor);
      }

      // Check for Ollama's generate API format which has a response field
      if (json.response) {
        // Use table buffering logic to handle content
        return this.processContentWithTableBuffering(json.response, currentText, editor, setAtCursor);
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
            text = this.processStreamLine(line, text, editor, cursorPositions.newCursor, serviceType, setAtCursor);
          } else if (line.trim() !== "") {
            // For Ollama and other non-OpenAI formats
            text = this.processStreamLine(line, text, editor, cursorPositions.newCursor, serviceType, setAtCursor);
          }
        }
      }
    } catch (error) {
      // console.error("Error processing stream:", error);
    }

    if (apiService && apiService.wasAborted()) {
      wasAborted = true;
      apiService.resetAbortedFlag();

      this.resetTableState();

      if (!setAtCursor) {
        editor.replaceRange("", cursorPositions.initialCursor, editor.getCursor());
      }

      return { text: "", wasAborted };
    }

    if (this.isInTable && this.tableBuffer) {
      if (this.tableStartPosition && !setAtCursor) {
        const currentCursor = editor.getCursor();
        editor.replaceRange(this.tableBuffer, this.tableStartPosition, currentCursor);
        editor.setCursor({
          line: this.tableStartPosition.line,
          ch: this.tableStartPosition.ch + this.tableBuffer.length,
        });
      } else if (setAtCursor) {
        editor.replaceSelection(this.tableBuffer);
      }

      text += this.tableBuffer;

      this.resetTableState();
    }

    if (unfinishedCodeBlock(text)) {
      const cursor = editor.getCursor();
      editor.replaceRange("\n```", cursor);
      text += "\n```";
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

      const cursor = editor.getCursor();
      editor.replaceRange(citationsText, cursor);
      editor.setCursor({ line: cursor.line, ch: cursor.ch + citationsText.length });

      text += citationsText;

      this.collectedCitations.clear();
    }

    if (!setAtCursor) {
      const cursor = editor.getCursor();
      editor.replaceRange("", cursor, {
        line: Infinity,
        ch: Infinity,
      });
    }

    return { text, wasAborted };
  }

  /**
   * Detect if a line contains a markdown table row
   */
  private isTableRow(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes("|") || trimmed.length < 3) return false;

    if (this.isTableSeparator(trimmed)) return false;

    const parts = trimmed.split("|");
    return parts.length >= 2 && parts.some((part) => part.trim().length > 0);
  }

  /**
   * Detect if a line is a table separator (header separator)
   */
  private isTableSeparator(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes("|") || !trimmed.includes("-")) return false;

    return /^[\|\-\:\s]+$/.test(trimmed);
  }

  /**
   * Detect if we've reached the end of a table
   */
  private isTableEnd(currentText: string, newContent: string): boolean {
    const lines = (currentText + newContent).split("\n");
    const lastNonEmptyLine = lines.filter((line) => line.trim() !== "").pop() || "";

    return this.isInTable && !this.isTableRow(lastNonEmptyLine) && !this.isTableSeparator(lastNonEmptyLine);
  }

  /**
   * Check if the buffered content contains a complete table
   */
  private isCompleteTable(content: string): boolean {
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < 2) return false;

    let hasHeader = false;
    let hasSeparator = false;
    let hasDataRow = false;

    for (const line of lines) {
      if (this.isTableRow(line)) {
        if (!hasSeparator) {
          hasHeader = true;
        } else {
          hasDataRow = true;
        }
      } else if (this.isTableSeparator(line)) {
        hasSeparator = true;
      }
    }

    return hasHeader && hasSeparator && hasDataRow;
  }

  /**
   * Reset table buffering state
   */
  private resetTableState(): void {
    this.isInTable = false;
    this.tableBuffer = "";
    this.tableStartPosition = null;
  }

  /**
   * Process content with table buffering logic
   */
  private processContentWithTableBuffering(
    content: string,
    currentText: string,
    editor: Editor,
    setAtCursor?: boolean
  ): string {
    if (!this.isInTable) {
      if (content.includes("|")) {
        const recentContext = currentText.slice(-200);
        const combinedContent = recentContext + content;
        const lines = combinedContent.split("\n");

        const hasTablePattern = lines.some((line) => {
          const trimmed = line.trim();
          return trimmed.includes("|") && (this.isTableRow(trimmed) || this.isTableSeparator(trimmed));
        });

        if (hasTablePattern) {
          this.isInTable = true;
          this.tableBuffer = content;
          this.tableStartPosition = editor.getCursor();
          return currentText + content;
        }
      }
    }

    if (this.isInTable) {
      this.tableBuffer += content;

      const shouldFlushTable = this.shouldFlushTable(this.tableBuffer, content);

      if (shouldFlushTable) {
        const { tableContent, remainingContent } = this.extractTableFromBuffer(this.tableBuffer);

        if (this.tableStartPosition && !setAtCursor) {
          const currentCursor = editor.getCursor();
          editor.replaceRange(tableContent, this.tableStartPosition, currentCursor);
          editor.setCursor({
            line: this.tableStartPosition.line,
            ch: this.tableStartPosition.ch + tableContent.length,
          });
        } else if (setAtCursor) {
          editor.replaceSelection(tableContent);
        }

        this.resetTableState();

        if (remainingContent) {
          if (setAtCursor) {
            editor.replaceSelection(remainingContent);
          } else {
            const cursor = editor.getCursor();
            editor.replaceRange(remainingContent, cursor);
            editor.setCursor({
              line: cursor.line,
              ch: cursor.ch + remainingContent.length,
            });
          }
          return currentText + tableContent + remainingContent;
        }

        return currentText + tableContent;
      }

      return currentText + content;
    }

    if (setAtCursor) {
      editor.replaceSelection(content);
    } else {
      const cursor = editor.getCursor();
      editor.replaceRange(content, cursor);
      editor.setCursor({
        line: cursor.line,
        ch: cursor.ch + content.length,
      });
    }

    return currentText + content;
  }

  /**
   * Determine if we should flush the table buffer
   */
  private shouldFlushTable(buffer: string, newContent: string): boolean {
    const lines = buffer.split("\n");

    const hasDoubleNewline = buffer.includes("\n\n");
    if (hasDoubleNewline) return true;

    const isComplete = this.isCompleteTable(buffer);

    if (isComplete && newContent.includes("\n")) {
      const lastLines = lines.slice(-3).filter((line) => line.trim() !== "");
      const hasNonTableContent = lastLines.some((line) => {
        const trimmed = line.trim();
        return trimmed !== "" && !this.isTableRow(trimmed) && !this.isTableSeparator(trimmed);
      });

      if (hasNonTableContent) return true;
    }

    if (buffer.length > 2000) return true;

    return false;
  }

  /**
   * Extract table content from buffer and separate any non-table content
   */
  private extractTableFromBuffer(buffer: string): { tableContent: string; remainingContent: string } {
    const reconstructedBuffer = this.reconstructTableLines(buffer);

    const lines = reconstructedBuffer.split("\n");
    const tableLines: string[] = [];
    let remainingLines: string[] = [];
    let foundTableEnd = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!foundTableEnd) {
        if (trimmed === "" || this.isTableRow(trimmed) || this.isTableSeparator(trimmed)) {
          tableLines.push(line);
        } else {
          foundTableEnd = true;
          remainingLines = lines.slice(i);
          break;
        }
      }
    }

    let tableContent = tableLines.join("\n");

    if (tableContent && !tableContent.endsWith("\n")) {
      tableContent += "\n";
    }

    const remainingContent = remainingLines.join("\n");

    return { tableContent, remainingContent };
  }

  /**
   * Reconstruct proper table lines from potentially malformed streaming content
   */
  private reconstructTableLines(content: string): string {
    let reconstructed = content;

    reconstructed = reconstructed.replace(/\|\|/g, "|\n|");

    reconstructed = reconstructed.replace(/\n\n+/g, "\n");

    return reconstructed;
  }
}
