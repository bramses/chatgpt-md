import { App, Editor, MarkdownView, Notice } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ChatTemplatesSuggestModal } from "src/Views/ChatTemplatesSuggestModal";
import { CHAT_FOLDER_TYPE, CHAT_TEMPLATE_FOLDER_TYPE } from "src/Constants";
import { FileService } from "./FileService";
import { EditorService } from "./EditorService";

/**
 * Service responsible for template management
 */
export class TemplateService {
  constructor(
    private app: App,
    private fileService: FileService,
    private editorService: EditorService
  ) {}

  /**
   * Create a new chat from a template
   */
  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, fileName: string): Promise<void> {
    try {
      if (!settings.chatFolder || settings.chatFolder.trim() === "") {
        new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
        return;
      }

      if (!settings.chatTemplateFolder || settings.chatTemplateFolder.trim() === "") {
        new Notice(`[ChatGPT MD] No chat template folder value found. Please set one in settings.`);
        return;
      }

      const chatFolderExists = await this.fileService.ensureFolderExists(settings.chatFolder, CHAT_FOLDER_TYPE);
      if (!chatFolderExists) {
        return;
      }

      const templateFolderExists = await this.fileService.ensureFolderExists(
        settings.chatTemplateFolder,
        CHAT_TEMPLATE_FOLDER_TYPE
      );
      if (!templateFolderExists) {
        return;
      }

      new ChatTemplatesSuggestModal(this.app, settings, fileName).open();
    } catch (err) {
      console.error(`[ChatGPT MD] Error in Create new chat from template`, err);
      new Notice(`[ChatGPT MD] Error in Create new chat from template, check console`);
    }
  }

  /**
   * Create a new chat with highlighted text
   */
  async createNewChatWithHighlightedText(editor: Editor, settings: ChatGPT_MDSettings): Promise<void> {
    try {
      const selectedText = editor.getSelection();

      if (!settings.chatFolder || settings.chatFolder.trim() === "") {
        new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
        return;
      }

      const chatFolderExists = await this.fileService.ensureFolderExists(settings.chatFolder, CHAT_FOLDER_TYPE);
      if (!chatFolderExists) {
        return;
      }

      const fileName = `${this.fileService.formatDate(new Date(), settings.dateFormat)}.md`;
      const filePath = `${settings.chatFolder}/${fileName}`;

      // Apply default frontmatter from settings
      let content = "";
      if (settings.defaultChatFrontmatter) {
        content = settings.defaultChatFrontmatter + "\n\n";
      }

      // Add the selected text after the frontmatter
      if (selectedText) {
        content += selectedText;
      }

      const newFile = await this.fileService.createNewFile(filePath, content);

      await this.app.workspace.openLinkText(newFile.basename, "", true, { state: { mode: "source" } });
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

      if (!activeView) {
        new Notice("No active markdown editor found.");
        return;
      }

      activeView.editor.focus();
      this.editorService.moveCursorToEnd(activeView.editor);
    } catch (err) {
      console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
      new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
    }
  }
}
