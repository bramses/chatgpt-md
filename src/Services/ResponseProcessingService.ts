import { Editor } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorContentService } from "./EditorContentService";
import { ROLE_USER } from "src/Constants";

/**
 * Service responsible for processing AI responses and updating the editor
 */
export class ResponseProcessingService {
  constructor(private editorContentService: EditorContentService) {}

  /**
   * Process an AI response and update the editor
   * @param editor The editor to update
   * @param response The AI response to process
   * @param settings The plugin settings
   */
  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    if (response.mode === "streaming") {
      this.processStreamingResponse(editor, settings);
    } else {
      this.processStandardResponse(editor, response, settings);
    }
  }

  /**
   * Process a streaming response
   * @param editor The editor to update
   * @param settings The plugin settings
   */
  private processStreamingResponse(editor: Editor, settings: ChatGPT_MDSettings): void {
    const headingPrefix = this.editorContentService.getHeadingPrefix(settings.headingLevel);
    const newLine = this.getHeaderRole(headingPrefix, ROLE_USER);
    editor.replaceRange(newLine, editor.getCursor());

    // move cursor to end of completion
    const cursor = editor.getCursor();
    const newCursor = {
      line: cursor.line,
      ch: cursor.ch + newLine.length,
    };
    editor.setCursor(newCursor);
  }

  /**
   * Process a standard (non-streaming) response
   * @param editor The editor to update
   * @param response The AI response to process
   * @param settings The plugin settings
   */
  private processStandardResponse(editor: Editor, response: string, settings: ChatGPT_MDSettings): void {
    let responseStr = response;
    if (this.unfinishedCodeBlock(responseStr)) {
      responseStr = responseStr + "\n```";
    }

    this.appendMessage(editor, responseStr, settings.headingLevel);
  }

  /**
   * Append a message to the editor
   * @param editor The editor to update
   * @param message The message to append
   * @param headingLevel The heading level to use
   */
  private appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = this.editorContentService.getHeadingPrefix(headingLevel);
    const assistantRoleHeader = this.getHeaderRole(headingPrefix, "assistant");
    const userRoleHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
  }

  /**
   * Get a header role string
   * @param headingPrefix The heading prefix to use
   * @param role The role to use
   * @returns The header role string
   */
  private getHeaderRole(headingPrefix: string, role: string): string {
    return `\n<hr class="__chatgpt_plugin">\n${headingPrefix}role::${role}\n`;
  }

  /**
   * Check if a code block is unfinished
   * @param text The text to check
   * @returns True if the code block is unfinished, false otherwise
   */
  private unfinishedCodeBlock(text: string): boolean {
    const codeBlockMatches = text.match(/```/g);
    return codeBlockMatches !== null && codeBlockMatches.length % 2 !== 0;
  }
}
