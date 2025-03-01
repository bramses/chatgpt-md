import { Editor } from "obsidian";
import {
  extractRoleAndMessage,
  removeCommentsFromMessages,
  removeYAMLFrontMatter,
  splitMessages,
  escapeRegExp,
} from "src/Utilities/TextHelpers";
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
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { Message } from "src/Models/Message";

/**
 * Service responsible for message extraction and processing
 */
export class MessageProcessingService {
  constructor(private fileService: FileService) {}

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

        if (linkTitle && !seenTitles.has(linkTitle)) {
          links.push({ link: fullLink, title: linkTitle });
          seenTitles.add(linkTitle);
        }
      }
    }

    return links;
  }

  /**
   * Clean messages from the editor content
   */
  cleanMessagesFromNote(editor: Editor): string[] {
    const messages = splitMessages(removeYAMLFrontMatter(editor.getValue()));
    return messages.map(removeCommentsFromMessages);
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
              content = content?.replace(regex, "").replace(YAML_FRONTMATTER_REGEX, "");

              message = message.replace(
                new RegExp(escapeRegExp(link.link), "g"),
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
    const messagesWithRole = messages.map(extractRoleAndMessage);

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
}
