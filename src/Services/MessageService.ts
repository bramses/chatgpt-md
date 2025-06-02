import { Editor, App, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { NotificationService } from "./NotificationService";
import {
  HORIZONTAL_LINE_MD,
  MARKDOWN_LINKS_REGEX,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_IDENTIFIER,
  ROLE_USER,
  WIKI_LINKS_REGEX,
  YAML_FRONTMATTER_REGEX,
} from "src/Constants";
import { getHeadingPrefix } from "../Utilities/TextHelpers";

/**
 * Service responsible for all message-related operations
 * This consolidates functionality previously spread across multiple files
 */
export class MessageService {
  constructor(
    private fileService: FileService,
    private notificationService: NotificationService,
    private app?: App
  ) {}

  /**
   * Find links in a message
   */
  findLinksInMessage(message: string): { link: string; title: string }[] {
    const regexes = [
      { regex: WIKI_LINKS_REGEX, fullMatchIndex: 0, titleIndex: 1 },
      { regex: MARKDOWN_LINKS_REGEX, fullMatchIndex: 0, titleIndex: 2 },
    ];

    const links: { link: string; title: string }[] = [];
    const seenTitles = new Set<string>();

    for (const { regex, fullMatchIndex, titleIndex } of regexes) {
      for (const match of message.matchAll(regex)) {
        const fullLink = match[fullMatchIndex];
        const linkTitle = match[titleIndex];

        // Skip URLs that start with http:// or https://
        if (
          linkTitle &&
          !seenTitles.has(linkTitle) &&
          !linkTitle.startsWith("http://") &&
          !linkTitle.startsWith("https://")
        ) {
          links.push({ link: fullLink, title: linkTitle });
          seenTitles.add(linkTitle);
        }
      }
    }

    return links;
  }

  /**
   * Split text into messages based on horizontal line separator
   */
  splitMessages(text: string | undefined): string[] {
    return text ? text.split(HORIZONTAL_LINE_MD) : [];
  }

  /**
   * Remove YAML frontmatter from text
   * For text from files, tries to use Obsidian's metadata cache if app context is available
   */
  removeYAMLFrontMatter(note: string | undefined): string | undefined {
    return note ? note.replace(YAML_FRONTMATTER_REGEX, "").trim() : note;
  }

  /**
   * Get content without frontmatter from current editor using Obsidian's metadata cache when possible
   */
  getContentWithoutFrontmatter(editor: Editor): string {
    const content = editor.getValue();

    // Try to use Obsidian's metadata cache for accurate frontmatter detection
    if (this.app) {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.file && this.app.metadataCache.getFileCache(view.file)?.frontmatter) {
        const frontmatterMatch = content.match(/^---[\s\S]*?---\n?/);
        return frontmatterMatch ? content.substring(frontmatterMatch[0].length).trim() : content;
      }
    }

    // Fallback to regex-based removal
    return this.removeYAMLFrontMatter(content) || "";
  }

  /**
   * Remove comments from messages
   */
  removeCommentsFromMessages(message: string): string {
    try {
      const commentBlock = /=begin-chatgpt-md-comment[\s\S]*?=end-chatgpt-md-comment/g;
      return message.replace(commentBlock, "");
    } catch (err) {
      this.notificationService.showError("Error removing comments from messages: " + err);
      return message;
    }
  }

  /**
   * Extract role and content from a message
   */
  extractRoleAndMessage(message: string): Message {
    try {
      if (!message.includes(ROLE_IDENTIFIER)) {
        return {
          role: ROLE_USER,
          content: message,
        };
      }

      const [roleSection, ...contentSections] = message.split(ROLE_IDENTIFIER)[1].split("\n");
      const cleanedRole = this.cleanupRole(roleSection);

      return {
        role: cleanedRole,
        content: contentSections.join("\n").trim(),
      };
    } catch (error) {
      this.notificationService.showError("Failed to extract role and message: " + error);
      return {
        role: ROLE_USER,
        content: message,
      };
    }
  }

  /**
   * Clean up role string to standardized format
   */
  private cleanupRole(role: string): string {
    const trimmedRole = role.trim().toLowerCase();
    const roles = [ROLE_USER, ROLE_ASSISTANT];
    const foundRole = roles.find((r) => trimmedRole.includes(r));

    if (foundRole) {
      return foundRole;
    }

    this.notificationService.showWarning(`Unknown role: "${role}", defaulting to user`);
    return ROLE_USER;
  }

  /**
   * Clean messages from the editor content
   */
  cleanMessagesFromNote(editor: Editor): string[] {
    const messages = this.splitMessages(this.getContentWithoutFrontmatter(editor));
    return messages.map((msg) => this.removeCommentsFromMessages(msg));
  }

  /**
   * Get messages from the editor
   */
  async getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    let messages = this.cleanMessagesFromNote(editor);

    messages = await Promise.all(
      messages.map(async (message) => {
        const links = this.findLinksInMessage(message);
        for (const link of links) {
          try {
            let content = await this.fileService.getLinkedNoteContentWithoutFrontmatter(link.title);

            if (content) {
              // remove the assistant and user delimiters
              // if the inlined note was already a chat
              const regex = new RegExp(
                `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}#+ ${ROLE_IDENTIFIER}(?:${ROLE_USER}|${ROLE_ASSISTANT}).*$`,
                "gm"
              );
              content = content?.replace(regex, "");

              message = message.replace(
                new RegExp(this.escapeRegExp(link.link), "g"),
                `${NEWLINE}${link.title}${NEWLINE}${content}${NEWLINE}`
              );
            } else {
              console.warn(`Error fetching linked note content for: ${link.link}`);
            }
          } catch (error) {
            console.error(error);
          }
        }

        return message;
      })
    );

    // Extract roles from each message
    const messagesWithRole = messages.map((msg) => this.extractRoleAndMessage(msg));

    return { messages, messagesWithRole };
  }

  /**
   * Add system commands to messages
   */
  addSystemCommandsToMessages(messagesWithRole: Message[], systemCommands: string[] | null): Message[] {
    if (!systemCommands || systemCommands.length === 0) {
      return messagesWithRole;
    }

    // Add system commands to the beginning of the list
    const systemMessages = systemCommands.map((command) => ({
      role: "system",
      content: command,
    }));

    return [...systemMessages, ...messagesWithRole];
  }

  /**
   * Get a header role string
   */
  getHeaderRole(headingPrefix: string, role: string, model?: string): string {
    return `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}${headingPrefix}${ROLE_IDENTIFIER}${role}${
      model ? `<span style="font-size: small;"> (${model})</span>` : ``
    }${NEWLINE}`;
  }

  /**
   * Check if a code block is unfinished
   */
  unfinishedCodeBlock(text: string): boolean {
    const codeBlockMatches = text.match(/```/g);
    return codeBlockMatches !== null && codeBlockMatches.length % 2 !== 0;
  }

  /**
   * Format a message for display
   */
  formatMessage(message: Message, headingLevel: number, model?: string): string {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const roleHeader = this.getHeaderRole(headingPrefix, message.role, model);
    return `${roleHeader}${message.content}`;
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = this.getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
  }

  /**
   * Process an AI response and update the editor
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
   * Process a streaming response
   */
  private processStreamingResponse(editor: Editor, settings: ChatGPT_MDSettings): void {
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
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
   */
  private processStandardResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    // Extract response text and model name
    const responseStr = typeof response === "object" ? response.fullString || response : response;
    const model = typeof response === "object" ? response.model : undefined;

    // Format response text (add closing code block if needed)
    const formattedResponse = this.unfinishedCodeBlock(responseStr) ? responseStr + "\n```" : responseStr;

    // Create headers with model name if available
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const assistantHeader = this.getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
    const userHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    // Insert the response
    editor.replaceRange(`${assistantHeader}${formattedResponse}${userHeader}`, editor.getCursor());
  }

  /**
   * Escape special characters in a string for use in a regular expression
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
