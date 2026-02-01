import { App, Plugin } from "obsidian";
import { FileService } from "src/Services/FileService";
import { MessageService } from "src/Services/MessageService";
import { TemplateService } from "src/Services/TemplateService";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
import { EditorService } from "src/Services/EditorService";
import { NotificationService } from "src/Services/NotificationService";
import { ErrorService } from "src/Services/ErrorService";
import { ApiService } from "src/Services/ApiService";
import { ApiAuthService } from "src/Services/ApiAuthService";
import { AiProviderService } from "src/Services/AiProviderService";
import { SettingsService } from "src/Services/SettingsService";
import { ToolService } from "src/Services/ToolService";
import { VaultSearchService } from "src/Services/VaultSearchService";
import { WebSearchService } from "src/Services/WebSearchService";

/**
 * Simple service container with readonly service instances.
 * NOT a service locator - services are accessed directly, not through lookups.
 *
 * This container uses constructor injection pattern:
 * - All services created once at initialization
 * - Dependencies passed through constructors
 * - Services accessed as readonly properties
 * - No hidden dependencies or global state
 */
export class ServiceContainer {
  // Core infrastructure
  readonly app: App;
  readonly plugin: Plugin;

  // Utility services
  readonly notificationService: NotificationService;
  readonly errorService: ErrorService;
  readonly apiService: ApiService;
  readonly apiAuthService: ApiAuthService;

  // Content services
  readonly fileService: FileService;
  readonly frontmatterManager: FrontmatterManager;
  readonly messageService: MessageService;
  readonly templateService: TemplateService;
  readonly editorService: EditorService;

  // AI services
  readonly aiProviderService: () => AiProviderService;

  // Settings (now includes frontmatter operations)
  readonly settingsService: SettingsService;

  // Tool services (consolidated into single ToolService)
  readonly vaultSearchService: VaultSearchService;
  readonly webSearchService: WebSearchService;
  readonly toolService: ToolService;

  private constructor(
    app: App,
    plugin: Plugin,
    notificationService: NotificationService,
    errorService: ErrorService,
    apiService: ApiService,
    apiAuthService: ApiAuthService,
    fileService: FileService,
    frontmatterManager: FrontmatterManager,
    messageService: MessageService,
    templateService: TemplateService,
    editorService: EditorService,
    aiProviderService: () => AiProviderService,
    settingsService: SettingsService,
    vaultSearchService: VaultSearchService,
    webSearchService: WebSearchService,
    toolService: ToolService
  ) {
    this.app = app;
    this.plugin = plugin;
    this.notificationService = notificationService;
    this.errorService = errorService;
    this.apiService = apiService;
    this.apiAuthService = apiAuthService;
    this.fileService = fileService;
    this.frontmatterManager = frontmatterManager;
    this.messageService = messageService;
    this.templateService = templateService;
    this.editorService = editorService;
    this.aiProviderService = aiProviderService;
    this.settingsService = settingsService;
    this.vaultSearchService = vaultSearchService;
    this.webSearchService = webSearchService;
    this.toolService = toolService;
  }

  /**
   * Factory method to create service container with all dependencies wired.
   * This is the ONLY place where service dependencies are defined.
   *
   * Dependencies are built in order from leaf nodes (no dependencies)
   * to composite services (depend on other services).
   */
  static create(app: App, plugin: Plugin): ServiceContainer {
    // === Leaf services (no dependencies) ===
    const notificationService = new NotificationService();
    const errorService = new ErrorService(notificationService);
    const apiService = new ApiService(errorService, notificationService);
    const apiAuthService = new ApiAuthService(notificationService);

    // === Content services ===
    const fileService = new FileService(app);
    const frontmatterManager = new FrontmatterManager(app);
    const messageService = new MessageService(fileService, notificationService);

    // === Settings service (now includes frontmatter operations) ===
    const settingsService = new SettingsService(plugin, frontmatterManager, notificationService, errorService);

    // === Editor service (composite, now includes content operations) ===
    // Create with settingsService (now includes frontmatter operations)
    const editorService = new EditorService(
      app,
      fileService,
      messageService,
      undefined, // templateService - will be set after creation
      settingsService
    );

    // Now create templateService with the merged editorService
    const templateService = new TemplateService(app, fileService, editorService);

    // === AI service factory ===
    // Using a factory function to create new instances when needed
    const aiProviderService = () => new AiProviderService();

    // Set the save settings callback for AI services
    AiProviderService.setSaveSettingsCallback(settingsService.saveSettings.bind(settingsService));

    // === Tool services (consolidated) ===
    const vaultSearchService = new VaultSearchService(app, fileService);
    const webSearchService = new WebSearchService(notificationService);
    const toolService = new ToolService(
      app,
      fileService,
      notificationService,
      settingsService.getSettings(),
      vaultSearchService,
      webSearchService
    );

    // === Create container ===
    return new ServiceContainer(
      app,
      plugin,
      notificationService,
      errorService,
      apiService,
      apiAuthService,
      fileService,
      frontmatterManager,
      messageService,
      templateService,
      editorService,
      aiProviderService,
      settingsService,
      vaultSearchService,
      webSearchService,
      toolService
    );
  }
}
