import { App, Plugin, SecretComponent } from "obsidian";
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
import { AgentService } from "src/Services/AgentService";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";

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

  // Agent service
  readonly agentService: AgentService;

  // Tool services (consolidated into single ToolService)
  readonly vaultSearchService: VaultSearchService;
  readonly webSearchService: WebSearchService;
  readonly toolService: ToolService;

  // ChatGPT history knowledge importer (opt-in; does no work until invoked)
  readonly knowledgeImportService: KnowledgeImportService;

  private constructor(
    app: App,
    plugin: Plugin,
    notificationService: NotificationService,
    errorService: ErrorService,
    apiAuthService: ApiAuthService,
    fileService: FileService,
    frontmatterManager: FrontmatterManager,
    messageService: MessageService,
    templateService: TemplateService,
    editorService: EditorService,
    aiProviderService: () => AiProviderService,
    settingsService: SettingsService,
    agentService: AgentService,
    vaultSearchService: VaultSearchService,
    webSearchService: WebSearchService,
    toolService: ToolService,
    knowledgeImportService: KnowledgeImportService
  ) {
    this.app = app;
    this.plugin = plugin;
    this.notificationService = notificationService;
    this.errorService = errorService;
    this.apiAuthService = apiAuthService;
    this.fileService = fileService;
    this.frontmatterManager = frontmatterManager;
    this.messageService = messageService;
    this.templateService = templateService;
    this.editorService = editorService;
    this.aiProviderService = aiProviderService;
    this.settingsService = settingsService;
    this.agentService = agentService;
    this.vaultSearchService = vaultSearchService;
    this.webSearchService = webSearchService;
    this.toolService = toolService;
    this.knowledgeImportService = knowledgeImportService;
  }

  /**
   * Factory method to create service container with all dependencies wired.
   * This is the ONLY place where service dependencies are defined.
   *
   * Dependencies are built in order from leaf nodes (no dependencies)
   * to composite services (depend on other services).
   */
  static create(app: App, plugin: Plugin): ServiceContainer {
    const infrastructure = this.createInfrastructureServices(app);
    const content = this.createContentServices(app, infrastructure.notificationService);
    const composites = this.createCompositeServices(app, plugin, infrastructure, content);
    const { settingsService, editorService, templateService, agentService } = composites;

    const aiProviderService = () =>
      new AiProviderService(new ApiService(), infrastructure.apiAuthService, infrastructure.notificationService);

    const vaultSearchService = new VaultSearchService(app, content.fileService);
    const webSearchService = new WebSearchService(infrastructure.notificationService);
    const toolService = new ToolService(
      app,
      content.fileService,
      infrastructure.notificationService,
      composites.settingsService.getSettings(),
      vaultSearchService,
      webSearchService,
      undefined,
      infrastructure.apiAuthService
    );

    const knowledgeImportService = new KnowledgeImportService(
      app,
      plugin,
      () => settingsService.getSettings(),
      aiProviderService,
      infrastructure.apiAuthService,
      infrastructure.notificationService
    );

    return new ServiceContainer(
      app,
      plugin,
      infrastructure.notificationService,
      infrastructure.errorService,
      infrastructure.apiAuthService,
      content.fileService,
      content.frontmatterManager,
      content.messageService,
      templateService,
      editorService,
      aiProviderService,
      settingsService,
      agentService,
      vaultSearchService,
      webSearchService,
      toolService,
      knowledgeImportService
    );
  }

  private static createCompositeServices(
    app: App,
    plugin: Plugin,
    infrastructure: ReturnType<typeof ServiceContainer.createInfrastructureServices>,
    content: ReturnType<typeof ServiceContainer.createContentServices>
  ): {
    settingsService: SettingsService;
    editorService: EditorService;
    templateService: TemplateService;
    agentService: AgentService;
  } {
    const agentService = new AgentService(app, content.fileService, content.frontmatterManager);
    const settingsService = new SettingsService(
      plugin,
      content.frontmatterManager,
      agentService,
      infrastructure.notificationService,
      infrastructure.apiAuthService
    );
    const editorService = new EditorService(content.fileService, content.messageService, settingsService);
    return {
      settingsService,
      editorService,
      agentService,
      templateService: new TemplateService(app, content.fileService, infrastructure.notificationService),
    };
  }

  private static createInfrastructureServices(app: App): {
    notificationService: NotificationService;
    errorService: ErrorService;
    apiAuthService: ApiAuthService;
  } {
    const notificationService = new NotificationService();
    const errorService = new ErrorService(notificationService);
    return {
      notificationService,
      errorService,
      apiAuthService: new ApiAuthService(app, SecretComponent as unknown),
    };
  }

  private static createContentServices(
    app: App,
    notificationService: NotificationService
  ): { fileService: FileService; frontmatterManager: FrontmatterManager; messageService: MessageService } {
    const fileService = new FileService(app, notificationService);
    return {
      fileService,
      frontmatterManager: new FrontmatterManager(app),
      messageService: new MessageService(fileService, notificationService),
    };
  }
}
