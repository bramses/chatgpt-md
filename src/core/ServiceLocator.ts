import { App, Plugin } from "obsidian";
import { FileService } from "src/Services/FileService";
import { EditorContentService } from "src/Services/EditorContentService";
import { MessageService } from "src/Services/MessageService";
import { TemplateService } from "src/Services/TemplateService";
import { FrontmatterService } from "src/Services/FrontmatterService";
import { EditorService } from "src/Services/EditorService";
import { NotificationService } from "src/Services/NotificationService";
import { ErrorService } from "src/Services/ErrorService";
import { ApiService } from "src/Services/ApiService";
import { ApiAuthService } from "src/Services/ApiAuthService";
import { ApiResponseParser } from "src/Services/ApiResponseParser";
import { IAiApiService } from "src/Services/AiService";
import { OpenAiService } from "src/Services/OpenAiService";
import { OllamaService } from "src/Services/OllamaService";
import { OpenRouterService } from "src/Services/OpenRouterService";
import { LmStudioService } from "src/Services/LmStudioService";
import { AI_SERVICE_LMSTUDIO, AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { SettingsService } from "src/Services/SettingsService";

/**
 * ServiceLocator is responsible for creating and providing access to services
 * It centralizes service creation and dependency injection
 */
export class ServiceLocator {
  private readonly app: App;
  private readonly plugin: Plugin;

  private fileService: FileService;
  private editorContentService: EditorContentService;
  private messageService: MessageService;
  private templateService: TemplateService;
  private frontmatterService: FrontmatterService;
  private editorService: EditorService;
  private notificationService: NotificationService;
  private errorService: ErrorService;
  private apiService: ApiService;
  private apiAuthService: ApiAuthService;
  private apiResponseParser: ApiResponseParser;
  private settingsService: SettingsService;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.initializeServices();
  }

  /**
   * Initialize all services
   */
  private initializeServices(): void {
    // Initialize basic services
    this.notificationService = new NotificationService();
    this.errorService = new ErrorService(this.notificationService);

    // Initialize API services
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);

    // Initialize specialized services
    this.fileService = new FileService(this.app);
    this.editorContentService = new EditorContentService();
    this.messageService = new MessageService(this.fileService, this.notificationService, this.app);
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

    // Initialize settings service
    this.settingsService = new SettingsService(this.plugin, this.notificationService, this.errorService);
  }

  /**
   * Get an AI API service based on the service type
   */
  getAiApiService(serviceType: string): IAiApiService {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        return new OpenAiService(
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser
        );
      case AI_SERVICE_OLLAMA:
        return new OllamaService(
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser
        );
      case AI_SERVICE_OPENROUTER:
        return new OpenRouterService(
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser
        );
      case AI_SERVICE_LMSTUDIO:
        return new LmStudioService(
          this.errorService,
          this.notificationService,
          this.apiService,
          this.apiAuthService,
          this.apiResponseParser
        );
      default:
        throw new Error(`Unknown AI service type: ${serviceType}`);
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

  getNotificationService(): NotificationService {
    return this.notificationService;
  }

  getErrorService(): ErrorService {
    return this.errorService;
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

  /**
   * Get the settings service
   */
  getSettingsService(): SettingsService {
    return this.settingsService;
  }
}
