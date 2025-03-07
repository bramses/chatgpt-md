import { App } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "src/Services/EditorService";
import { FileService } from "src/Services/FileService";
import { EditorContentService } from "src/Services/EditorContentService";
import { MessageService } from "src/Services/MessageService";
import { TemplateService } from "src/Services/TemplateService";
import { FrontmatterService } from "src/Services/FrontmatterService";
import { StreamService } from "src/Services/StreamService";
import { StreamManager } from "src/managers/StreamManager";
import { NotificationService } from "src/Services/NotificationService";
import { ErrorService } from "src/Services/ErrorService";
import { EditorUpdateService } from "src/Services/EditorUpdateService";
import { IAiApiService } from "src/Services/AiService";
import { OpenAiService } from "src/Services/OpenAiService";
import { OllamaService } from "src/Services/OllamaService";
import { OpenRouterService } from "src/Services/OpenRouterService";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { ApiService } from "src/Services/ApiService";
import { ApiAuthService } from "src/Services/ApiAuthService";
import { ApiResponseParser } from "src/Services/ApiResponseParser";

/**
 * Provides access to all services used by the plugin
 */
export class ServiceLocator {
  private app: App;
  private settings: ChatGPT_MDSettings;

  // Services
  private fileService: FileService;
  private editorContentService: EditorContentService;
  private messageService: MessageService;
  private templateService: TemplateService;
  private frontmatterService: FrontmatterService;
  private editorService: EditorService;
  private streamService: StreamService;
  private streamManager: StreamManager;
  private notificationService: NotificationService;
  private errorService: ErrorService;
  private editorUpdateService: EditorUpdateService;
  private apiService: ApiService;
  private apiAuthService: ApiAuthService;
  private apiResponseParser: ApiResponseParser;

  constructor(app: App, settings: ChatGPT_MDSettings) {
    this.app = app;
    this.settings = settings;

    // Initialize services
    this.initializeServices();
  }

  /**
   * Initialize all services
   */
  private initializeServices(): void {
    // Initialize basic services
    this.notificationService = new NotificationService();
    this.errorService = new ErrorService(this.notificationService);
    this.editorUpdateService = new EditorUpdateService(this.notificationService);

    // Initialize API services
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.editorUpdateService, this.notificationService);

    // Initialize streaming services
    this.streamService = new StreamService(
      this.errorService,
      this.notificationService,
      this.editorUpdateService,
      this.apiService,
      this.apiResponseParser
    );
    this.streamManager = new StreamManager(this.errorService, this.notificationService);

    // Initialize specialized services
    this.fileService = new FileService(this.app);
    this.editorContentService = new EditorContentService();
    this.messageService = new MessageService(this.fileService, this.notificationService);
    this.frontmatterService = new FrontmatterService(this.app);
    this.templateService = new TemplateService(this.app, this.fileService, this.editorContentService);

    // Initialize the EditorService with all specialized services
    this.editorService = new EditorService(
      this.app,
      this.fileService,
      this.editorContentService,
      this.messageService,
      this.templateService,
      this.frontmatterService
    );
  }

  /**
   * Get an AI API service based on the service type
   */
  getAiApiService(serviceType: string): IAiApiService {
    // Create a StreamManager for backward compatibility
    const streamManager = new StreamManager(this.errorService, this.notificationService);

    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        return new OpenAiService(
          streamManager,
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser,
          this.editorUpdateService
        );
      case AI_SERVICE_OLLAMA:
        return new OllamaService(
          streamManager,
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser,
          this.editorUpdateService
        );
      case AI_SERVICE_OPENROUTER:
        return new OpenRouterService(
          streamManager,
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser,
          this.editorUpdateService
        );
      default:
        throw new Error(`Unsupported API type: ${serviceType}`);
    }
  }

  // Getters for all services
  getFileService(): FileService {
    return this.fileService;
  }

  getEditorContentService(): EditorContentService {
    return this.editorContentService;
  }

  getMessageService(): MessageService {
    return this.messageService;
  }

  getTemplateService(): TemplateService {
    return this.templateService;
  }

  getFrontmatterService(): FrontmatterService {
    return this.frontmatterService;
  }

  getEditorService(): EditorService {
    return this.editorService;
  }

  getStreamService(): StreamService {
    return this.streamService;
  }

  getStreamManager(): StreamManager {
    return this.streamManager;
  }

  getNotificationService(): NotificationService {
    return this.notificationService;
  }

  getErrorService(): ErrorService {
    return this.errorService;
  }

  getEditorUpdateService(): EditorUpdateService {
    return this.editorUpdateService;
  }

  getApiService(): ApiService {
    return this.apiService;
  }

  getApiAuthService(): ApiAuthService {
    return this.apiAuthService;
  }

  getApiResponseParser(): ApiResponseParser {
    return this.apiResponseParser;
  }
}
