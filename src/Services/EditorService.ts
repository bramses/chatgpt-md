import { App, Editor, MarkdownView, Notice } from "obsidian";
import { createFolderModal } from "src/Utilities/ModalHelpers";
import {
  extractRoleAndMessage,
  getHeadingPrefix,
  parseSettingsFrontmatter,
  removeCommentsFromMessages,
  removeYAMLFrontMatter,
  getHeaderRole,
  splitMessages,
  unfinishedCodeBlock,
} from "src/Utilities/TextHelpers";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ChatTemplates } from "src/Views/ChatTemplates";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import {
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  CHAT_FOLDER_TYPE,
  CHAT_TEMPLATE_FOLDER_TYPE,
  DEFAULT_HEADING_LEVEL,
  MAX_HEADING_LEVEL,
  HORIZONTAL_LINE_CLASS,
  ROLE_ASSISTANT,
  ROLE_DEVELOPER,
  ROLE_IDENTIFIER,
  ROLE_SYSTEM,
  ROLE_USER,
} from "src/Constants";
import { DEFAULT_OLLAMA_API_CONFIG } from "src/Services/OllamaService";

export class EditorService {
  constructor(private app: App) {}

  async writeInferredTitle(view: MarkdownView, chatFolder: string, title: string): Promise<void> {
    try {
      // set title of file
      const file = view.file;
      if (!file) {
        throw new Error("No file is currently open");
      }

      // replace trailing / if it exists
      const folder = chatFolder.replace(/\/$/, "");

      // if new file name exists in directory, append a number to the end
      let newFileName = `${folder}/${title}.md`;
      let i = 1;

      while (await this.app.vault.adapter.exists(newFileName)) {
        newFileName = `${folder}/${title} (${i}).md`;
        i++;
      }

      await this.ensureFolderExists(chatFolder, CHAT_FOLDER_TYPE);

      await this.app.fileManager.renameFile(file, newFileName);
    } catch (err) {
      new Notice("[ChatGPT MD] Error writing inferred title to editor");
      console.log("[ChatGPT MD] Error writing inferred title to editor", err);
      throw err;
    }
  }

  async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    if (!(await this.app.vault.adapter.exists(folderPath))) {
      const result = await createFolderModal(this.app, this.app.vault, folderType, folderPath);
      if (!result) {
        new Notice(
          `[ChatGPT MD] No ${folderType} found. One must be created to use plugin. Set one in settings and make sure it exists.`
        );
        return false;
      }
    }
    return true;
  }

  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    const NEWLINE = "\n\n";

    const formattedContent = [
      NEWLINE,
      `<hr class="${HORIZONTAL_LINE_CLASS}">`,
      NEWLINE,
      `${getHeadingPrefix(headingLevel)}${ROLE_IDENTIFIER}${role}`,
      NEWLINE,
    ].join("");

    const currentPosition = editor.getCursor();

    // Insert the formatted content at current cursor position
    editor.replaceRange(formattedContent, currentPosition);

    // Calculate and set new cursor position
    const newPosition = {
      line: currentPosition.line,
      ch: currentPosition.ch + formattedContent.length,
    };

    editor.setCursor(newPosition);
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

      const newFile = await this.app.vault.create(
        `${settings.chatFolder}/${this.getDate(new Date(), settings.dateFormat)}.md`,
        `${settings.defaultChatFrontmatter}\n\n${selectedText}`
      );

      // open new file
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

  appendMessage(editor: Editor, role: string, message: string, headingLevel: number): void {
    const newLine = `${getHeaderRole(getHeadingPrefix(headingLevel), role)}${message}${getHeaderRole(getHeadingPrefix(headingLevel), ROLE_USER)}`;
    editor.replaceRange(newLine, editor.getCursor());
  }

  clearChat(editor: Editor): void {
    try {
      const YAML_FRONTMATTER_REGEX = /---\s*[\s\S]*?\s*---/g;
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
      // get length of file
      const length = editor.lastLine();

      // move cursor to end of file https://davidwalsh.name/codemirror-set-focus-line
      const newCursor = {
        line: length + 1,
        ch: 0,
      };
      editor.setCursor(newCursor);
    } catch (err) {
      throw new Error("Error moving cursor to end of file" + err);
    }
  }

  getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): {
    messages: string[];
    messagesWithRole: { role: string; content: string }[];
  } {
    const bodyWithoutYML = removeYAMLFrontMatter(editor.getValue());
    let messages = splitMessages(bodyWithoutYML);
    messages = messages.map((message) => {
      return removeCommentsFromMessages(message);
    });

    const messagesWithRole = messages.map((message) => {
      return extractRoleAndMessage(message);
    });

    const frontmatter = this.getFrontmatter(null, settings, this.app);
    if (frontmatter.system_commands) {
      const systemCommands = frontmatter.system_commands;
      messagesWithRole.unshift(
        ...systemCommands.map((command: string) => {
          return {
            role: frontmatter.aiService == AI_SERVICE_OPENAI ? ROLE_DEVELOPER : ROLE_SYSTEM,
            content: command,
          };
        })
      );
    }

    return {
      messages,
      messagesWithRole,
    };
  }

  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, titleDate: string): Promise<void> {
    if (!settings.chatFolder || settings.chatFolder.trim() === "") {
      new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
      return;
    }

    const chatFolderExists = await this.ensureFolderExists(settings.chatFolder, CHAT_FOLDER_TYPE);
    if (!chatFolderExists) {
      return;
    }

    if (!settings.chatTemplateFolder || settings.chatTemplateFolder.trim() === "") {
      new Notice(`[ChatGPT MD] No chat template folder value found. Please set one in settings.`);
      return;
    }

    const chatTemplateFolderExists = await this.ensureFolderExists(
      settings.chatTemplateFolder,
      CHAT_TEMPLATE_FOLDER_TYPE
    );
    if (!chatTemplateFolderExists) {
      return;
    }

    new ChatTemplates(this.app, settings, titleDate).open();
  }

  getDate(date: Date, format = "YYYYMMDDhhmmss"): string {
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

  aiProviderFromUrl(url?: string, model?: string): string {
    const trimmedUrl = (url ?? "").trim().toLowerCase();
    const trimmedModel = (model ?? "").trim().toLowerCase();

    if (trimmedModel.includes("@")) {
      const provider = trimmedModel.split("@")[0];
      if (["local", AI_SERVICE_OLLAMA].includes(provider)) return AI_SERVICE_OLLAMA;
      if (provider === AI_SERVICE_OPENAI) return AI_SERVICE_OPENAI;
    }

    if (trimmedUrl.startsWith("http://localhost") || trimmedUrl.startsWith("http://127.0.0.1")) {
      return AI_SERVICE_OLLAMA;
    }

    return AI_SERVICE_OPENAI;
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

    const aiService = this.aiProviderFromUrl(metaMatter.url, metaMatter.model);

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
    let responseStr = response;
    if (response.mode === "streaming") {
      responseStr = response.fullstr;
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
      if (unfinishedCodeBlock(responseStr)) {
        responseStr = responseStr + "\n```";
      }

      this.appendMessage(editor, ROLE_ASSISTANT, responseStr, settings.headingLevel);
    }
  }
}
