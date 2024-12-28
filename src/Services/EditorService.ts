import { App, Editor, MarkdownView, Notice } from "obsidian";

import { createFolderModal } from "src/Utilities/ModalHelpers";
import {
  extractRoleAndMessage,
  getHeadingPrefix,
  removeCommentsFromMessages,
  removeYAMLFrontMatter,
  splitMessages,
} from "src/Utilities/TextHelpers";
import { ChatGPT_MDSettings, HORIZONTAL_LINE } from "src/Models/Config";
import { ChatTemplates } from "src/Views/ChatTemplates";
import { DEFAULT_OPENAI_CONFIG } from "../Models/OpenAIConfig";

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

      await this.ensureFolderExists(chatFolder, "chatFolder");

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
    const HORIZONTAL_RULE_CLASS = "__chatgpt_plugin";
    const NEWLINE = "\n\n";

    const formattedContent = [
      NEWLINE,
      `<hr class="${HORIZONTAL_RULE_CLASS}">`,
      NEWLINE,
      `${getHeadingPrefix(headingLevel)}role::${role}`,
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

      const chatFolderExists = await this.ensureFolderExists(settings.chatFolder, "chatFolder");
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
    const newLine = `\n\n${HORIZONTAL_LINE}\n\n${getHeadingPrefix(headingLevel)}role::${role}\n\n${message}\n\n${HORIZONTAL_LINE}\n\n${getHeadingPrefix(headingLevel)}role::user\n\n`;
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

  getMessagesFromEditor(editor: Editor): {
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

    const chatFolderExists = await this.ensureFolderExists(settings.chatFolder, "chatFolder");
    if (!chatFolderExists) {
      return;
    }

    if (!settings.chatTemplateFolder || settings.chatTemplateFolder.trim() === "") {
      new Notice(`[ChatGPT MD] No chat template folder value found. Please set one in settings.`);
      return;
    }

    const chatTemplateFolderExists = await this.ensureFolderExists(settings.chatTemplateFolder, "chatTemplateFolder");
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

  getFrontmatter(view: MarkdownView, settings: ChatGPT_MDSettings, app: App) {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
      throw new Error("No active file found");
    }

    const metaMatter = app.metadataCache.getFileCache(activeFile)?.frontmatter;
    if (!metaMatter) {
      throw new Error("No frontmatter found in the active file");
    }

    const determineStreamSetting = (): boolean => {
      if (metaMatter.stream !== undefined) return metaMatter.stream;
      if (settings.stream !== undefined) return settings.stream;
      return true;
    };

    return {
      title: metaMatter.title ?? view.file?.basename ?? "Untitled",
      tags: metaMatter.tags ?? [],
      model: metaMatter.model ?? DEFAULT_OPENAI_CONFIG.model,
      temperature: metaMatter.temperature ?? DEFAULT_OPENAI_CONFIG.temperature,
      top_p: metaMatter.top_p ?? DEFAULT_OPENAI_CONFIG.topP,
      presence_penalty: metaMatter.presence_penalty ?? DEFAULT_OPENAI_CONFIG.presencePenalty,
      frequency_penalty: metaMatter.frequency_penalty ?? DEFAULT_OPENAI_CONFIG.frequencyPenalty,
      stream: determineStreamSetting(),
      max_tokens: metaMatter.max_tokens ?? DEFAULT_OPENAI_CONFIG.maxTokens,
      stop: metaMatter.stop ?? null,
      n: metaMatter.n ?? DEFAULT_OPENAI_CONFIG.n,
      logit_bias: metaMatter.logit_bias ?? null,
      user: metaMatter.user ?? null,
      system_commands: metaMatter.system_commands ?? null,
      url: metaMatter.url ?? DEFAULT_OPENAI_CONFIG.url,
    };
  }
}
