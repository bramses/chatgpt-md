import { App, Plugin } from "obsidian";
import { FileService } from "src/Services/FileService";
import { EditorContentService } from "src/Services/EditorContentService";
import { MessageService } from "src/Services/MessageService";
import { TemplateService } from "src/Services/TemplateService";
import { FrontmatterService } from "src/Services/FrontmatterService";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
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
import { AnthropicService } from "src/Services/AnthropicService";
import { GeminiService } from "src/Services/GeminiService";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "src/Constants";
import { SettingsService } from "src/Services/SettingsService";
import { VaultTools } from "src/Services/VaultTools";
import { ToolRegistry } from "src/Services/ToolRegistry";
import { ToolExecutor } from "src/Services/ToolExecutor";
import { ToolService } from "src/Services/ToolService";

/**
 * Registry mapping service types to their constructors
 */
const AI_SERVICE_REGISTRY: Map<string, new () => IAiApiService> = new Map(
  [
    [AI_SERVICE_OPENAI, OpenAiService],
    [AI_SERVICE_ANTHROPIC, AnthropicService],
    [AI_SERVICE_GEMINI, GeminiService],
    [AI_SERVICE_OLLAMA, OllamaService],
    [AI_SERVICE_LMSTUDIO, LmStudioService],
    [AI_SERVICE_OPENROUTER, OpenRouterService],
  ] as [string, new () => IAiApiService][]
);

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
  private frontmatterManager: FrontmatterManager;
  private frontmatterService: FrontmatterService;
  private editorService: EditorService;
  private notificationService: NotificationService;
  private errorService: ErrorService;
  private apiService: ApiService;
  private apiAuthService: ApiAuthService;
  private apiResponseParser: ApiResponseParser;
  private settingsService: SettingsService;
  private vaultTools: VaultTools;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private toolService: ToolService;

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
    this.frontmatterManager = new FrontmatterManager(this.app);
    this.editorContentService = new EditorContentService(this.app);
    this.messageService = new MessageService(this.fileService, this.notificationService);
    this.frontmatterService = new FrontmatterService(this.app, this.frontmatterManager);
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

    // Initialize tool services
    this.vaultTools = new VaultTools(this.app, this.fileService);
    this.toolRegistry = new ToolRegistry(this.app, this.vaultTools);
    this.toolExecutor = new ToolExecutor(this.app, this.toolRegistry, this.notificationService);
    this.toolService = new ToolService(this.app, this.toolRegistry, this.toolExecutor);
  }

  /**
   * Get an AI API service based on the service type
   */
  getAiApiService(serviceType: string): IAiApiService {
    const ServiceClass = AI_SERVICE_REGISTRY.get(serviceType);

    if (!ServiceClass) {
      throw new Error(`Unknown AI service type: ${serviceType}`);
    }

    return new ServiceClass();
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

  getFrontmatterManager(): FrontmatterManager {
    return this.frontmatterManager;
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

  /**
   * Get the tool service for AI tool calling
   */
  getToolService(): ToolService {
    return this.toolService;
  }

  /**
   * Get the tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get the vault tools
   */
  getVaultTools(): VaultTools {
    return this.vaultTools;
  }

  /**
   * Get the tool executor
   */
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }
}
