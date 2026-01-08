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
import { AiProviderService } from "src/Services/AiProviderService";
import { SettingsService } from "src/Services/SettingsService";
import { VaultTools } from "src/Services/VaultTools";
import { WebSearchService } from "src/Services/WebSearchService";
import { ToolRegistry } from "src/Services/ToolRegistry";
import { ToolExecutor } from "src/Services/ToolExecutor";
import { ToolService } from "src/Services/ToolService";
import { ModelCapabilitiesCache } from "src/Models/ModelCapabilities";

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
	readonly modelCapabilities: ModelCapabilitiesCache;

	// Utility services
	readonly notificationService: NotificationService;
	readonly errorService: ErrorService;
	readonly apiService: ApiService;
	readonly apiAuthService: ApiAuthService;
	readonly apiResponseParser: ApiResponseParser;

	// Content services
	readonly fileService: FileService;
	readonly frontmatterManager: FrontmatterManager;
	readonly editorContentService: EditorContentService;
	readonly messageService: MessageService;
	readonly frontmatterService: FrontmatterService;
	readonly templateService: TemplateService;
	readonly editorService: EditorService;

	// AI services
	readonly aiProviderService: () => AiProviderService;

	// Settings
	readonly settingsService: SettingsService;

	// Tool services
	readonly webSearchService: WebSearchService;
	readonly vaultTools: VaultTools;
	readonly toolRegistry: ToolRegistry;
	readonly toolExecutor: ToolExecutor;
	readonly toolService: ToolService;

	private constructor(
		app: App,
		plugin: Plugin,
		modelCapabilities: ModelCapabilitiesCache,
		notificationService: NotificationService,
		errorService: ErrorService,
		apiService: ApiService,
		apiAuthService: ApiAuthService,
		apiResponseParser: ApiResponseParser,
		fileService: FileService,
		frontmatterManager: FrontmatterManager,
		editorContentService: EditorContentService,
		messageService: MessageService,
		frontmatterService: FrontmatterService,
		templateService: TemplateService,
		editorService: EditorService,
		aiProviderService: () => AiProviderService,
		settingsService: SettingsService,
		webSearchService: WebSearchService,
		vaultTools: VaultTools,
		toolRegistry: ToolRegistry,
		toolExecutor: ToolExecutor,
		toolService: ToolService
	) {
		this.app = app;
		this.plugin = plugin;
		this.modelCapabilities = modelCapabilities;
		this.notificationService = notificationService;
		this.errorService = errorService;
		this.apiService = apiService;
		this.apiAuthService = apiAuthService;
		this.apiResponseParser = apiResponseParser;
		this.fileService = fileService;
		this.frontmatterManager = frontmatterManager;
		this.editorContentService = editorContentService;
		this.messageService = messageService;
		this.frontmatterService = frontmatterService;
		this.templateService = templateService;
		this.editorService = editorService;
		this.aiProviderService = aiProviderService;
		this.settingsService = settingsService;
		this.webSearchService = webSearchService;
		this.vaultTools = vaultTools;
		this.toolRegistry = toolRegistry;
		this.toolExecutor = toolExecutor;
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
		// Create model capabilities cache (shared state)
		const modelCapabilities = new ModelCapabilitiesCache();

		// === Leaf services (no dependencies) ===
		const notificationService = new NotificationService();
		const errorService = new ErrorService(notificationService);
		const apiService = new ApiService(errorService, notificationService);
		const apiAuthService = new ApiAuthService(notificationService);
		const apiResponseParser = new ApiResponseParser(notificationService);

		// === Content services ===
		const fileService = new FileService(app);
		const frontmatterManager = new FrontmatterManager(app);
		const editorContentService = new EditorContentService(app);
		const messageService = new MessageService(fileService, notificationService);

		// === Settings service ===
		const settingsService = new SettingsService(plugin, notificationService, errorService);

		// === Frontmatter and template services ===
		const frontmatterService = new FrontmatterService(app, frontmatterManager);
		const templateService = new TemplateService(app, fileService, editorContentService);

		// === Editor service (composite) ===
		const editorService = new EditorService(
			app,
			fileService,
			editorContentService,
			messageService,
			templateService,
			frontmatterService
		);

		// === AI service factory ===
		// Using a factory function to create new instances when needed
		const aiProviderService = () => new AiProviderService(modelCapabilities);

		// Set the save settings callback for AI services
		AiProviderService.setSaveSettingsCallback(settingsService.saveSettings.bind(settingsService));

		// === Tool services ===
		const webSearchService = new WebSearchService(notificationService);
		const vaultTools = new VaultTools(app, fileService);
		const toolRegistry = new ToolRegistry(app, vaultTools, webSearchService, settingsService);
		const toolExecutor = new ToolExecutor(app, toolRegistry, notificationService);
		const toolService = new ToolService(app, toolRegistry, toolExecutor);

		// === Create container ===
		return new ServiceContainer(
			app,
			plugin,
			modelCapabilities,
			notificationService,
			errorService,
			apiService,
			apiAuthService,
			apiResponseParser,
			fileService,
			frontmatterManager,
			editorContentService,
			messageService,
			frontmatterService,
			templateService,
			editorService,
			aiProviderService,
			settingsService,
			webSearchService,
			vaultTools,
			toolRegistry,
			toolExecutor,
			toolService
		);
	}
}
