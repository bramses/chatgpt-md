import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { NotificationService } from "./NotificationService";
import {
	HORIZONTAL_LINE_MD,
	NEWLINE,
	ROLE_ASSISTANT,
	ROLE_IDENTIFIER,
	ROLE_USER,
} from "src/Constants";
import { getHeaderRole, getHeadingPrefix } from "../Utilities/TextHelpers";
import { findLinksInMessage, splitMessages, removeYAMLFrontMatter } from "../Utilities/MessageHelpers";

/**
 * Service responsible for all message-related operations
 * Now uses utility functions for common operations
 */
export class MessageService {
  constructor(
    private fileService: FileService,
    private notificationService: NotificationService
  ) {}

  /**
   * Find links in a message
   * Delegates to utility function
   */
  findLinksInMessage(message: string): { link: string; title: string }[] {
    return findLinksInMessage(message);
  }

  /**
   * Split text into messages based on horizontal line separator
   * Delegates to utility function
   */
  splitMessages(text: string | undefined): string[] {
    return splitMessages(text);
  }

  /**
   * Remove YAML frontmatter from text
   * Delegates to utility function
   */
  removeYAMLFrontMatter(note: string | undefined): string | undefined {
    return removeYAMLFrontMatter(note);
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
    const messages = this.splitMessages(this.removeYAMLFrontMatter(editor.getValue()));
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
            let content = await this.fileService.getLinkedNoteContent(link.title);

            if (content) {
              // remove the assistant and user delimiters
              // if the inlined note was already a chat
              const regex = new RegExp(
                `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}#+ ${ROLE_IDENTIFIER}(?:${ROLE_USER}|${ROLE_ASSISTANT}).*$`,
                "gm"
              );
              content = content?.replace(regex, "");
              content = this.removeYAMLFrontMatter(content) || null;

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
   * Format a message for display
   */
  formatMessage(message: Message, headingLevel: number, model?: string): string {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const roleHeader = getHeaderRole(headingPrefix, message.role, model);
    return `${roleHeader}${message.content}`;
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = getHeaderRole(headingPrefix, ROLE_USER);

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
   * Process a streaming response by adding user delimiter
   */
  private processStreamingResponse(editor: Editor, settings: ChatGPT_MDSettings): void {
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const userHeader = getHeaderRole(headingPrefix, ROLE_USER);

    // Get cursor position set by ApiResponseParser after streaming completes
    const cursorBeforeHeader = editor.getCursor();

    // Insert user header at current position
    editor.replaceRange(userHeader, cursorBeforeHeader);

    // Calculate cursor position after the inserted header
    const newCursor = editor.offsetToPos(editor.posToOffset(cursorBeforeHeader) + userHeader.length);

    // Set cursor to end of inserted content
    editor.setCursor(newCursor);
  }

  /**
   * Process a standard (non-streaming) response
   */
  private processStandardResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    let responseStr: string;
    let model: string | undefined;

    if (typeof response === "object" && response !== null) {
      responseStr = response.fullString || JSON.stringify(response.text || response) || "[No response]";
      model = response.model;
    } else {
      responseStr = String(response || "[No response]");
    }

    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const assistantHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
    const userHeader = getHeaderRole(headingPrefix, ROLE_USER);

    // Get cursor position before insertion
    const cursorBeforeInsertion = editor.getCursor();
    const fullContent = `${assistantHeader}${responseStr}${userHeader}`;

    // Insert full response content
    editor.replaceRange(fullContent, cursorBeforeInsertion);

    // Calculate final cursor position using offset API
    const newCursor = editor.offsetToPos(editor.posToOffset(cursorBeforeInsertion) + fullContent.length);

    // Set cursor to end of inserted content
    editor.setCursor(newCursor);
  }

  /**
   * Escape special characters in a string for use in a regular expression
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
