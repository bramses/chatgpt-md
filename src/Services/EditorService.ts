import { App, Editor, MarkdownView, Notice } from "obsidian";
import { createFolderModal } from "src/Utilities/ModalHelpers";
import {
  escapeRegExp,
  extractRoleAndMessage,
  getHeaderRole,
  getHeadingPrefix,
  parseSettingsFrontmatter,
  removeCommentsFromMessages,
  removeYAMLFrontMatter,
  splitMessages,
  unfinishedCodeBlock,
} from "src/Utilities/TextHelpers";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ChatTemplates } from "src/Views/ChatTemplates";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import {
  AI_SERVICE_OPENAI,
  CHAT_FOLDER_TYPE,
  CHAT_TEMPLATE_FOLDER_TYPE,
  DEFAULT_DATE_FORMAT,
  DEFAULT_HEADING_LEVEL,
  HORIZONTAL_LINE_CLASS,
  HORIZONTAL_LINE_MD,
  MARKDOWN_LINKS_REGEX,
  MAX_HEADING_LEVEL,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_DEVELOPER,
  ROLE_IDENTIFIER,
  ROLE_SYSTEM,
  ROLE_USER,
  WIKI_LINKS_REGEX,
  YAML_FRONTMATTER_REGEX,
} from "src/Constants";
import { DEFAULT_OLLAMA_API_CONFIG } from "src/Services/OllamaService";
import { aiProviderFromUrl } from "./AiService";

export class EditorService {
  constructor(private app: App) {}

  async writeInferredTitle(view: MarkdownView, title: string): Promise<void> {
    const file = view.file;
    if (!file) {
      throw new Error("No file is currently open");
    }

    const currentFolder = file.parent?.path ?? "/";
    let newFileName = `${currentFolder}/${title}.md`;

    for (let i = 1; await this.app.vault.adapter.exists(newFileName); i++) {
      newFileName = `${currentFolder}/${title} (${i}).md`;
    }

    try {
      await this.app.fileManager.renameFile(file, newFileName);
    } catch (err) {
      new Notice("[ChatGPT MD] Error writing inferred title to editor");
      console.log("[ChatGPT MD] Error writing inferred title to editor", err);
      throw err;
    }
  }

  private async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    const exists = await this.app.vault.adapter.exists(folderPath);

    if (!exists) {
      const result = await createFolderModal(this.app, folderType, folderPath);
      if (!result) {
        new Notice(
          `[ChatGPT MD] No ${folderType} found. One must be created to use the plugin. Set one in settings and make sure it exists.`
        );
        return false;
      }
    }

    return true;
  }

  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    const formattedContent = `${NEWLINE}<hr class="${HORIZONTAL_LINE_CLASS}">${NEWLINE}${getHeadingPrefix(headingLevel)}${ROLE_IDENTIFIER}${role}${NEWLINE}`;

    const currentPosition = editor.getCursor();

    editor.replaceRange(formattedContent, currentPosition);
    editor.setCursor(currentPosition.line + formattedContent.split("\n").length - 1, 0);
  }

  async createNewChatWithHighlightedText(editor: Editor, settings: ChatGPT_MDSettings): Promise<void> {
    try {
      const selectedText = editor.getSelection();

      if (!settings.chatFolder || settings.chatFolder.trim() === "") {
        new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
        return;
      }

      const chatFolderExists = await this.ensureFolderExists(settings.chatFolder, CHAT_FOLDER_TYPE);
      if (!chatFolderExists) {
        return;
      }

      const fileName = `${this.getDate(new Date(), settings.dateFormat)}.md`;
      const filePath = `${settings.chatFolder}/${fileName}`;

      const newFile = await this.app.vault.create(filePath, selectedText);

      await this.app.workspace.openLinkText(newFile.basename, "", true, { state: { mode: "source" } });
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (!activeView) {
        new Notice("No active markdown editor found.");
        return;
      }

      activeView.editor.focus();
      this.moveCursorToEnd(activeView.editor);
    } catch (err) {
      console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
      new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
    }
  }

  private appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
  }

  clearChat(editor: Editor): void {
    try {
      // Extract frontmatter from current content
      const content = editor.getValue();
      const frontmatterMatches = content.match(YAML_FRONTMATTER_REGEX);

      if (!frontmatterMatches || frontmatterMatches.length === 0) {
        throw new Error("No YAML frontmatter found in the document");
      }

      const frontmatter = frontmatterMatches[0];

      // Clear editor and restore frontmatter
      editor.setValue("");
      editor.replaceRange(frontmatter, editor.getCursor());

      // Position cursor at the end of the document
      const newCursorPosition = {
        line: editor.lastLine() + 1,
        ch: 0,
      };

      editor.setCursor(newCursorPosition);
    } catch (error) {
      throw new Error(`Failed to clear conversation: ${error.message}`);
    }
  }

  moveCursorToEnd(editor: Editor): void {
    try {
      const length = editor.lastLine();

      const newCursor = {
        line: length + 1,
        ch: 0,
      };
      editor.setCursor(newCursor);
    } catch (err) {
      throw new Error("Error moving cursor to end of file" + err);
    }
  }

  private findLinksInMessage(message: string): { link: string; title: string }[] {
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

  private getLinkedNoteContent = async (linkPath: string) => {
    try {
      const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, "");

      return file ? await this.app.vault.read(file) : null;
    } catch (error) {
      console.error(`Error reading linked note: ${linkPath}`, error);
      return null;
    }
  };

  private cleanMessagesFromNote(editor: Editor) {
    const messages = splitMessages(removeYAMLFrontMatter(editor.getValue()));
    return messages.map(removeCommentsFromMessages);
  }

  async getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: { role: string; content: string }[];
  }> {
    let messages = this.cleanMessagesFromNote(editor);

    messages = await Promise.all(
      messages.map(async (message) => {
        const links = this.findLinksInMessage(message);
        for (const link of links) {
          try {
            let content = await this.getLinkedNoteContent(link.title);

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

    // Add system commands to the beginning of the list if they exist
    const frontmatter = this.getFrontmatter(null, settings, this.app);
    if (frontmatter.system_commands) {
      const role = frontmatter.aiService === AI_SERVICE_OPENAI ? ROLE_DEVELOPER : ROLE_SYSTEM;
      frontmatter.system_commands.forEach((command) => messagesWithRole.unshift({ role, content: command }));
    }

    return { messages, messagesWithRole };
  }

  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, titleDate: string): Promise<void> {
    const { chatFolder, chatTemplateFolder } = settings;

    if (!chatFolder || !chatFolder.trim()) {
      new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
      return;
    }

    if (!(await this.ensureFolderExists(chatFolder, CHAT_FOLDER_TYPE))) {
      return;
    }

    if (!chatTemplateFolder || !chatTemplateFolder.trim()) {
      new Notice(`[ChatGPT MD] No chat template folder value found. Please set one in settings.`);
      return;
    }

    if (!(await this.ensureFolderExists(chatTemplateFolder, CHAT_TEMPLATE_FOLDER_TYPE))) {
      return;
    }

    new ChatTemplates(this.app, settings, titleDate).open();
  }

  getDate(date: Date, format = DEFAULT_DATE_FORMAT): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    const paddedMonth = month.toString().padStart(2, "0");
    const paddedDay = day.toString().padStart(2, "0");
    const paddedHour = hour.toString().padStart(2, "0");
    const paddedMinute = minute.toString().padStart(2, "0");
    const paddedSecond = second.toString().padStart(2, "0");

    return format
      .replace("YYYY", year.toString())
      .replace("MM", paddedMonth)
      .replace("DD", paddedDay)
      .replace("hh", paddedHour)
      .replace("mm", paddedMinute)
      .replace("ss", paddedSecond);
  }

  getFrontmatter(view: MarkdownView | null, settings: ChatGPT_MDSettings, app: App) {
    const activeFile = view?.file || app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error("No active file found");
    }

    // get the settings frontmatter
    const settingsFrontmatter = parseSettingsFrontmatter(settings.defaultChatFrontmatter);
    // merge with frontmatter from current file
    const noteFrontmatter = app.metadataCache.getFileCache(activeFile)?.frontmatter || {};
    const metaMatter = {
      ...settingsFrontmatter,
      ...noteFrontmatter,
    };

    if (!noteFrontmatter.url) {
      delete metaMatter.url;
    }

    const aiService = aiProviderFromUrl(metaMatter.url, metaMatter.model);

    const defaultConfig = aiService == AI_SERVICE_OPENAI ? DEFAULT_OPENAI_CONFIG : DEFAULT_OLLAMA_API_CONFIG;

    return {
      ...defaultConfig,
      ...metaMatter,
      model: metaMatter.model.split("@")[1] || metaMatter.model,
      aiService: aiService,
      stream: metaMatter.stream ?? settings.stream ?? defaultConfig.stream,
      title: view?.file?.basename ?? defaultConfig.title,
    };
  }

  getHeadingPrefix(headingLevel: number): string {
    if (headingLevel === DEFAULT_HEADING_LEVEL) {
      return "";
    } else if (headingLevel > MAX_HEADING_LEVEL) {
      return "#".repeat(MAX_HEADING_LEVEL) + " ";
    }
    return "#".repeat(headingLevel) + " ";
  }

  async processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings) {
    if (response.mode === "streaming") {
      const newLine = getHeaderRole(this.getHeadingPrefix(settings.headingLevel), ROLE_USER);
      editor.replaceRange(newLine, editor.getCursor());

      // move cursor to end of completion
      const cursor = editor.getCursor();
      const newCursor = {
        line: cursor.line,
        ch: cursor.ch + newLine.length,
      };
      editor.setCursor(newCursor);
    } else {
      let responseStr = response;
      if (unfinishedCodeBlock(responseStr)) {
        responseStr = responseStr + "\n```";
      }

      this.appendMessage(editor, responseStr, settings.headingLevel);
    }
  }
}
