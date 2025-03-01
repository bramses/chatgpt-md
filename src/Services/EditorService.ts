import { App, Editor, MarkdownView } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { YAML_FRONTMATTER_REGEX } from "src/Constants";
import { FileService } from "./FileService";
import { EditorContentService } from "./EditorContentService";
import { MessageProcessingService } from "./MessageProcessingService";
import { TemplateService } from "./TemplateService";
import { FrontmatterService } from "./FrontmatterService";
import { ResponseProcessingService } from "./ResponseProcessingService";
import { Message } from "src/Models/Message";

/**
 * Service responsible for editor operations
 * @deprecated Use the specialized services instead
 */
export class EditorService {
  private fileService: FileService;
  private editorContentService: EditorContentService;
  private messageProcessingService: MessageProcessingService;
  private templateService: TemplateService;
  private frontmatterService: FrontmatterService;
  private responseProcessingService: ResponseProcessingService;

  constructor(
    private app: App,
    fileService?: FileService,
    editorContentService?: EditorContentService,
    messageProcessingService?: MessageProcessingService,
    templateService?: TemplateService,
    frontmatterService?: FrontmatterService,
    responseProcessingService?: ResponseProcessingService
  ) {
    // Initialize services if not provided
    this.fileService = fileService || new FileService(app);
    this.editorContentService = editorContentService || new EditorContentService();
    this.messageProcessingService = messageProcessingService || new MessageProcessingService(this.fileService);
    this.frontmatterService = frontmatterService || new FrontmatterService(app);
    this.templateService = templateService || new TemplateService(app, this.fileService, this.editorContentService);
    this.responseProcessingService =
      responseProcessingService || new ResponseProcessingService(this.editorContentService);
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

  // EditorContentService delegations

  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    this.editorContentService.addHorizontalRule(editor, role, headingLevel);
  }

  clearChat(editor: Editor): void {
    this.editorContentService.clearChat(editor);
  }

  moveCursorToEnd(editor: Editor): void {
    this.editorContentService.moveCursorToEnd(editor);
  }

  getHeadingPrefix(headingLevel: number): string {
    return this.editorContentService.getHeadingPrefix(headingLevel);
  }

  // MessageProcessingService delegations

  async getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    return this.messageProcessingService.getMessagesFromEditor(editor, settings);
  }

  // TemplateService delegations

  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, fileName: string): Promise<void> {
    return this.templateService.createNewChatFromTemplate(settings, fileName);
  }

  async createNewChatWithHighlightedText(editor: Editor, settings: ChatGPT_MDSettings): Promise<void> {
    return this.templateService.createNewChatWithHighlightedText(editor, settings);
  }

  // FrontmatterService delegations

  getFrontmatter(view: MarkdownView, settings: ChatGPT_MDSettings, app: App): any {
    return this.frontmatterService.getFrontmatter(view, settings);
  }

  // ResponseProcessingService delegations

  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    this.responseProcessingService.processResponse(editor, response, settings);
  }

  /**
   * Set the model in the front matter of the active file
   */
  setModel(editor: Editor, modelName: string): void {
    const content = editor.getValue();

    const frontmatterMatches = content.match(YAML_FRONTMATTER_REGEX);

    let newContent;

    if (frontmatterMatches) {
      const frontmatter = frontmatterMatches[0];
      let extractedFrontmatter = frontmatter.replace(/---/g, "");

      const modelRegex = /^model:\s*(.*)$/m;
      if (modelRegex.test(extractedFrontmatter)) {
        extractedFrontmatter = extractedFrontmatter.replace(modelRegex, `model: ${modelName}`);
      } else {
        extractedFrontmatter += `\nmodel: ${modelName}`;
      }

      newContent = content.replace(YAML_FRONTMATTER_REGEX, `---${extractedFrontmatter}---`);
    } else {
      newContent = `---\nmodel: ${modelName}\n---\n${content}`;
    }

    editor.setValue(newContent);
  }
}
