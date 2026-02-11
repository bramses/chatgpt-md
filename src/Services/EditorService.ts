import { App, Editor, MarkdownView } from "obsidian";
import { ChatGPT_MDSettings, MergedFrontmatterConfig } from "src/Models/Config";
import { FileService } from "./FileService";
import { MessageService } from "./MessageService";
import { TemplateService } from "./TemplateService";
import { SettingsService } from "./SettingsService";
import { FrontmatterManager } from "./FrontmatterManager";
import { NotificationService } from "./NotificationService";
import { Message } from "src/Models/Message";
import { addCommentBlock, addHorizontalRule, moveCursorToEnd } from "src/Utilities/EditorHelpers";

/**
 * Service responsible for editor operations
 * Now includes editor content operations (merged from EditorContentService)
 */
export class EditorService {
  private fileService: FileService;
  private frontmatterManager?: FrontmatterManager;
  private messageService: MessageService;
  private templateService: TemplateService;
  private settingsService: SettingsService;

  constructor(
    private app: App,
    fileService?: FileService,
    messageService?: MessageService,
    templateService?: TemplateService,
    settingsService?: SettingsService
  ) {
    // Initialize services if not provided
    this.fileService = fileService || new FileService(app);
    this.frontmatterManager = new FrontmatterManager(app);
    const notificationService = new NotificationService();
    this.messageService = messageService || new MessageService(this.fileService, notificationService);

    // SettingsService now handles frontmatter operations (merged from FrontmatterService)
    if (!settingsService) {
      throw new Error("SettingsService must be provided as it includes frontmatter operations");
    }
    this.settingsService = settingsService;

    this.templateService = templateService || new TemplateService(app, this.fileService, this);
  }

  // FileService delegations

  async writeInferredTitle(view: MarkdownView, title: string): Promise<void> {
    return this.fileService.writeInferredTitle(view, title);
  }

  async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    return this.fileService.ensureFolderExists(folderPath, folderType);
  }

  getDate(date: Date, format: string): string {
    return this.fileService.formatDate(date, format);
  }

  // Editor content operations (merged from EditorContentService)

  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    addHorizontalRule(editor, role, headingLevel);
  }

  async clearChat(editor: Editor): Promise<void> {
    const frontmatterContent = await this.preserveFrontmatter();
    editor.setValue(frontmatterContent);
    this.positionCursorAfterClear(editor, frontmatterContent);
  }

  private async preserveFrontmatter(): Promise<string> {
    if (!this.app || !this.frontmatterManager) {
      return "";
    }

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView?.file) {
      return "";
    }

    try {
      const frontmatter = await this.frontmatterManager.readFrontmatter(activeView.file);
      if (!frontmatter || Object.keys(frontmatter).length === 0) {
        return "";
      }

      return this.formatFrontmatter(frontmatter);
    } catch (error) {
      console.error("[EditorService] Error reading frontmatter:", error);
      return "";
    }
  }

  private formatFrontmatter(frontmatter: Record<string, unknown>): string {
    const entries = Object.entries(frontmatter)
      .filter(([key]) => key !== "position")
      .map(([key, value]) => (typeof value === "string" ? `${key}: "${value}"` : `${key}: ${value}`));

    return entries.length > 0 ? `---\n${entries.join("\n")}\n---\n\n` : "";
  }

  private positionCursorAfterClear(editor: Editor, content: string): void {
    if (content) {
      editor.setCursor({ line: editor.lastLine() + 1, ch: 0 });
    } else {
      editor.setCursor({ line: 0, ch: 0 });
    }
  }

  moveCursorToEnd(editor: Editor): void {
    moveCursorToEnd(editor);
  }

  addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
    addCommentBlock(editor, commentStart, commentEnd);
  }

  // MessageService delegations

  async getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    return this.messageService.getMessagesFromEditor(editor, settings);
  }

  // TemplateService delegations

  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, fileName: string): Promise<void> {
    return this.templateService.createNewChatFromTemplate(settings, fileName);
  }

  async createNewChatWithHighlightedText(editor: Editor, settings: ChatGPT_MDSettings): Promise<void> {
    return this.templateService.createNewChatWithHighlightedText(editor, settings);
  }

  // FrontmatterService delegations

  async getFrontmatter(view: MarkdownView, settings: ChatGPT_MDSettings, app: App): Promise<MergedFrontmatterConfig> {
    return await this.settingsService.getFrontmatter(view);
  }

  // ResponseProcessingService delegations

  processResponse(editor: Editor, response: { fullString: string; mode: string }, settings: ChatGPT_MDSettings): void {
    this.messageService.processResponse(editor, response, settings);
  }

  /**
   * Set the model in the front matter of the active file
   */
  async setModel(editor: Editor, modelName: string): Promise<void> {
    await this.settingsService.updateFrontmatterField(editor, "model", modelName);
  }
}
