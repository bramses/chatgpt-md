import { App, Editor, MarkdownView } from "obsidian";
import { ChatGPT_MDSettings } from "../../Models/Config";
import { Message } from "../../Models/Message";
import { parseYaml, stringifyYaml } from "obsidian";

/**
 * EditorManager - Consolidated editor operations
 *
 * Focuses on core editor functionality without external service dependencies.
 * Consolidates message parsing, frontmatter handling, and basic editor operations.
 */
export class EditorManager {
  constructor(private app: App) {}

  /**
   * Get messages from editor content
   */
  async getMessages(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    const content = this.getContentWithoutFrontmatter(editor);
    const messages = this.cleanMessagesFromNote(content);

    // Process messages and expand linked content
    const processedMessages = await Promise.all(
      messages.map(async (message) => {
        const expandedMessage = await this.expandLinkedContent(message);
        return this.removeCommentsFromMessages(expandedMessage);
      })
    );

    const messagesWithRole = processedMessages.map((message) => this.extractRoleAndMessage(message));

    return {
      messages: processedMessages,
      messagesWithRole,
    };
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number = 2): void {
    if (!editor) return;

    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const prefix = line.trim() === "" ? "" : "\n\n";

    editor.replaceRange(`${prefix}${message}`, cursor);
    this.moveCursorToEnd(editor);
  }

  /**
   * Get frontmatter from the current view
   */
  getFrontmatter(view: MarkdownView, settings: ChatGPT_MDSettings): any {
    if (!view?.file) return this.generateDefaultFrontmatter(settings);

    const cache = this.app.metadataCache.getFileCache(view.file);
    const frontmatter = cache?.frontmatter || {};

    // Merge with defaults
    return {
      ...this.generateDefaultFrontmatter(settings),
      ...frontmatter,
    };
  }

  /**
   * Update a frontmatter field
   */
  updateFrontmatterField(editor: Editor, key: string, value: any): void {
    const content = editor.getValue();
    const lines = content.split("\n");

    // Check if frontmatter exists
    if (lines[0] !== "---") {
      // No frontmatter, add it
      const newFrontmatter = `---\n${key}: ${this.formatYamlValue(value)}\n---\n`;
      editor.replaceRange(newFrontmatter, { line: 0, ch: 0 });
      return;
    }

    // Find end of frontmatter
    let endIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) return; // Malformed frontmatter

    // Parse existing frontmatter
    const frontmatterLines = lines.slice(1, endIndex);
    const frontmatterText = frontmatterLines.join("\n");

    try {
      const frontmatter = frontmatterText.trim() ? parseYaml(frontmatterText) || {} : {};
      frontmatter[key] = value;

      const newFrontmatterText = stringifyYaml(frontmatter).trim();
      const newLines = ["---", ...newFrontmatterText.split("\n"), "---", ...lines.slice(endIndex + 1)];

      editor.setValue(newLines.join("\n"));
    } catch (error) {
      console.error("[ChatGPT MD] Error updating frontmatter:", error);
    }
  }

  /**
   * Clear chat content (preserve frontmatter)
   */
  clearChat(editor: Editor): void {
    const content = editor.getValue();
    const lines = content.split("\n");

    if (lines[0] === "---") {
      // Find end of frontmatter
      let endIndex = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === "---") {
          endIndex = i;
          break;
        }
      }

      if (endIndex !== -1) {
        const frontmatterSection = lines.slice(0, endIndex + 1).join("\n");
        editor.setValue(frontmatterSection + "\n\n");
        return;
      }
    }

    // No frontmatter, clear everything
    editor.setValue("");
  }

  /**
   * Move cursor to end of document
   */
  moveCursorToEnd(editor: Editor): void {
    const lastLine = editor.lastLine();
    const lastLineLength = editor.getLine(lastLine).length;
    editor.setCursor(lastLine, lastLineLength);
  }

  /**
   * Add horizontal rule with heading
   */
  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    const heading = "#".repeat(headingLevel);
    const rule = `\n\n${heading} ${role}\n\n---\n\n`;

    const cursor = editor.getCursor();
    editor.replaceRange(rule, cursor);
    this.moveCursorToEnd(editor);
  }

  /**
   * Add comment block
   */
  addCommentBlock(editor: Editor, commentStart: string = "<!--", commentEnd: string = "-->"): void {
    const cursor = editor.getCursor();
    const commentBlock = `\n\n${commentStart}\n\n${commentEnd}\n\n`;

    editor.replaceRange(commentBlock, cursor);
    // Position cursor inside the comment
    const newCursor = {
      line: cursor.line + 2,
      ch: 0,
    };
    editor.setCursor(newCursor);
  }

  /**
   * Write inferred title to file
   */
  async writeInferredTitle(view: MarkdownView, title: string): Promise<void> {
    if (!view?.file) return;

    const sanitizedTitle = this.sanitizeFileName(title);
    const newPath = view.file.path.replace(view.file.name, `${sanitizedTitle}.md`);

    try {
      await this.app.fileManager.renameFile(view.file, newPath);
    } catch (error) {
      console.error("[ChatGPT MD] Error renaming file:", error);
    }
  }

  /**
   * Get content without frontmatter
   */
  private getContentWithoutFrontmatter(editor: Editor): string {
    const content = editor.getValue();
    const lines = content.split("\n");

    if (lines[0] !== "---") return content;

    // Find end of frontmatter
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        return lines.slice(i + 1).join("\n");
      }
    }

    return content;
  }

  /**
   * Clean messages from note content
   */
  private cleanMessagesFromNote(content: string): string[] {
    const headingRegex = /^#{1,6}\s+(.*)$/gm;
    const messages: string[] = [];
    const lines = content.split("\n");
    let currentMessage = "";

    for (const line of lines) {
      if (headingRegex.test(line)) {
        if (currentMessage.trim()) {
          messages.push(currentMessage.trim());
        }
        currentMessage = line + "\n";
      } else {
        currentMessage += line + "\n";
      }
    }

    if (currentMessage.trim()) {
      messages.push(currentMessage.trim());
    }

    return messages.filter((msg) => msg.trim().length > 0);
  }

  /**
   * Extract role and message from content
   */
  private extractRoleAndMessage(content: string): Message {
    const headingMatch = content.match(/^#{1,6}\s+(.*)$/m);

    if (headingMatch) {
      const role = this.cleanupRole(headingMatch[1]);
      const message = content.replace(/^#{1,6}\s+.*$/m, "").trim();
      return { role, content: message };
    }

    return { role: "user", content: content.trim() };
  }

  /**
   * Clean up role string
   */
  private cleanupRole(role: string): string {
    return (
      role
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim() || "user"
    );
  }

  /**
   * Remove comments from messages
   */
  private removeCommentsFromMessages(message: string): string {
    return message.replace(/<!--[\s\S]*?-->/g, "").trim();
  }

  /**
   * Expand linked content in messages
   */
  private async expandLinkedContent(message: string): Promise<string> {
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let expandedMessage = message;
    const matches = Array.from(message.matchAll(linkRegex));

    for (const match of matches) {
      const linkPath = match[1];
      const linkedContent = await this.getLinkedNoteContent(linkPath);

      if (linkedContent) {
        expandedMessage = expandedMessage.replace(match[0], linkedContent);
      }
    }

    return expandedMessage;
  }

  /**
   * Get linked note content
   */
  private async getLinkedNoteContent(linkPath: string): Promise<string | null> {
    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, "");
    if (!file) return null;

    try {
      const content = await this.app.vault.read(file);
      return this.removeYamlFrontmatter(content);
    } catch (error) {
      console.error("[ChatGPT MD] Error reading linked file:", error);
      return null;
    }
  }

  /**
   * Remove YAML frontmatter from content
   */
  private removeYamlFrontmatter(content: string): string {
    const lines = content.split("\n");
    if (lines[0] !== "---") return content;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        return lines
          .slice(i + 1)
          .join("\n")
          .trim();
      }
    }

    return content;
  }

  /**
   * Generate default frontmatter
   */
  private generateDefaultFrontmatter(settings: ChatGPT_MDSettings): any {
    // Parse the default frontmatter template
    try {
      const frontmatterMatch = settings.defaultChatFrontmatter.match(/---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        // Simple YAML parsing for the default structure
        const yamlContent = frontmatterMatch[1];
        const result: any = {};

        // Parse each line
        yamlContent.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const colonIndex = trimmed.indexOf(":");
            if (colonIndex > 0) {
              const key = trimmed.substring(0, colonIndex).trim();
              const valueStr = trimmed.substring(colonIndex + 1).trim();
              let value: any;

              // Parse basic YAML values
              if (valueStr.startsWith("[") && valueStr.endsWith("]")) {
                // Array
                value = valueStr
                  .slice(1, -1)
                  .split(",")
                  .map((item) => item.trim().replace(/^['"]|['"]$/g, ""));
              } else if (valueStr === "true" || valueStr === "false") {
                // Boolean
                value = valueStr === "true";
              } else if (!isNaN(Number(valueStr))) {
                // Number
                value = Number(valueStr);
              } else {
                // String (remove quotes if present)
                value = valueStr.replace(/^['"]|['"]$/g, "");
              }

              result[key] = value;
            }
          }
        });

        return result;
      }
    } catch (error) {
      console.error("[ChatGPT MD] Error parsing default frontmatter:", error);
    }

    // Fallback default
    return {
      system_commands: ["I am a helpful assistant."],
      frequency_penalty: 0,
      max_tokens: 300,
      model: "gpt-4o-mini",
      presence_penalty: 0,
      stream: true,
      temperature: 1,
    };
  }

  /**
   * Format YAML value
   */
  private formatYamlValue(value: any): string {
    if (typeof value === "string") {
      return value.includes(" ") ? `"${value}"` : value;
    }
    return String(value);
  }

  /**
   * Process AI response and add proper formatting
   */
  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    if (response.mode === "streaming") {
      // Only add user section if streaming was not aborted
      if (!response.wasAborted) {
        this.processStreamingResponse(editor, settings);
      }
    } else {
      this.processStandardResponse(editor, response, settings);
    }
  }

  /**
   * Process streaming response - add user header for next input
   */
  private processStreamingResponse(editor: Editor, settings: ChatGPT_MDSettings): void {
    const headingPrefix = "#".repeat(settings.headingLevel);
    const userHeader = `\n\n<hr class="__chatgpt_plugin">\n\n${headingPrefix} role::user\n\n`;
    editor.replaceRange(userHeader, editor.getCursor());

    // Move cursor to end
    this.moveCursorToEnd(editor);
  }

  /**
   * Process standard (non-streaming) response - add assistant + response + user headers
   */
  private processStandardResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    // Extract response text and model name
    let responseStr: string;
    if (typeof response === "object" && response !== null) {
      responseStr = response.fullString || response.content || String(response);
    } else {
      responseStr = String(response || "");
    }
    const model = typeof response === "object" ? response.model : undefined;

    // Format response text (add closing code block if needed)
    const formattedResponse = this.unfinishedCodeBlock(responseStr) ? responseStr + "\n```" : responseStr;

    // Create headers with model name if available
    const headingPrefix = "#".repeat(settings.headingLevel);
    const modelDisplay = model ? `<span style="font-size: small;"> (${model})</span>` : "";
    const assistantHeader = `\n\n<hr class="__chatgpt_plugin">\n\n${headingPrefix} role::assistant${modelDisplay}\n\n`;
    const userHeader = `\n\n<hr class="__chatgpt_plugin">\n\n${headingPrefix} role::user\n\n`;

    // Insert the complete response
    editor.replaceRange(`${assistantHeader}${formattedResponse}${userHeader}`, editor.getCursor());
  }

  /**
   * Check if a code block is unfinished
   */
  private unfinishedCodeBlock(text: string): boolean {
    if (typeof text !== "string" || !text) {
      return false;
    }
    const codeBlockMatches = text.match(/```/g);
    return codeBlockMatches !== null && codeBlockMatches.length % 2 !== 0;
  }

  /**
   * Sanitize filename
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 255);
  }
}
