import { App, Editor, MarkdownView } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
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
    let frontmatterContent = "";

    // Try to use FrontmatterManager to preserve frontmatter
    if (this.app && this.frontmatterManager) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView?.file) {
        try {
          const frontmatter = await this.frontmatterManager.readFrontmatter(activeView.file);
          if (frontmatter && Object.keys(frontmatter).length > 0) {
            // Reconstruct frontmatter from the data
            const frontmatterEntries = Object.entries(frontmatter)
              .filter(([key]) => key !== "position") // Exclude Obsidian's internal position data
              .map(([key, value]) => {
                if (typeof value === "string") {
                  return `${key}: "${value}"`;
                }
                return `${key}: ${value}`;
              });

            if (frontmatterEntries.length > 0) {
              frontmatterContent = `---\n${frontmatterEntries.join("\n")}\n---\n\n`;
            }
          }
        } catch (error) {
          console.error("[EditorService] Error reading frontmatter:", error);
        }
      }
    }

    // Clear editor and restore frontmatter
    editor.setValue(frontmatterContent);

    // Position cursor at the end of the document
    if (frontmatterContent) {
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

  async getFrontmatter(view: MarkdownView, settings: ChatGPT_MDSettings, app: App): Promise<any> {
    return await this.settingsService.getFrontmatter(view);
  }

  // ResponseProcessingService delegations

  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    this.messageService.processResponse(editor, response, settings);
  }

  /**
   * Set the model in the front matter of the active file
   */
  async setModel(editor: Editor, modelName: string): Promise<void> {
    await this.settingsService.updateFrontmatterField(editor, "model", modelName);
  }
}
