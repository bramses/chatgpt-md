import { Plugin } from "obsidian";
import { ServiceContainer } from "./core/ServiceContainer";
import { ChatHandler } from "./Commands/ChatHandler";
import { ModelSelectHandler } from "./Commands/ModelSelectHandler";
import { AddCommentBlockHandler, AddDividerHandler } from "./Commands/SimpleHandlers";
import { StopStreamingHandler } from "./Commands/StopStreamingHandler";
import { InferTitleHandler } from "./Commands/InferTitleHandler";
import { ChooseChatTemplateHandler, ClearChatHandler, MoveToNewChatHandler } from "./Commands/RemainingHandlers";
import { ChooseAgentHandler, CreateAgentHandler } from "./Commands/AgentHandlers";
import { CommandRegistrar } from "./Commands/CommandRegistrar";
import {
  ConfigureVaultRouterHandler,
  DryRunRoutingHandler,
  ImportChatGPTHistoryHandler,
  OpenReviewQueueHandler,
  ProcessChatGPTInboxHandler,
  RebuildKnowledgeIndexHandler,
  ReprocessAllHandler,
  ReprocessConversationHandler,
  ResumeKnowledgeImportHandler,
  RetryFailedConversationsHandler,
  StopWatchingChatGPTInboxHandler,
  ViewKnowledgeStatusHandler,
  WatchChatGPTInboxHandler,
} from "./Commands/Knowledge/KnowledgeHandlers";
import {
  ChallengeCurrentStoryHandler,
  EnoughAnalysisHandler,
  OpenHorizonHandler,
  ReviewPersonalModelsHandler,
  ShowSomethingForgottenHandler,
  UnexpectedConnectionHandler,
} from "./Commands/Knowledge/ObservatoryHandlers";
import {
  CAPTURE_KINDS,
  CaptureHandler,
  EnsureProjectContextHandler,
  GenerateCanvasesHandler,
  InstallTemplatesHandler,
  OpenKnowledgeHomeHandler,
  PluginIntegrationStatusHandler,
  RefreshPluginCapabilitiesHandler,
  ValidateKnowledgeGraphHandler,
  WriteSystemStatusHandler,
} from "./Commands/Knowledge/OrchestrationHandlers";
import { Logger } from "./Utilities/Logger";

export default class ChatGPT_MD extends Plugin {
  /**
   * In-process knowledge API for other plugins and external agents
   * (Local REST API, MCP servers, companions). Present only when the knowledge
   * importer is enabled. This plugin never opens a port of its own, and write
   * operations stay refused unless the user enabled them in settings.
   */
  knowledgeApi?: ReturnType<ServiceContainer["knowledgeImportService"]["knowledgeApi"]>;

  private services: ServiceContainer;
  private modelSelectHandler: ModelSelectHandler;
  private stopStreamingHandler: StopStreamingHandler;
  private chatHandler: ChatHandler;
  private inferTitleHandler: InferTitleHandler;

  async onload() {
    // Create service container with all dependencies wired
    this.services = ServiceContainer.create(this.app, this);

    // Get settings service and ensure migrations run first
    const settingsService = this.services.settingsService;
    await settingsService.loadSettings();
    await settingsService.migrateSettings();
    await settingsService.migrateCredentials();

    // Add settings tab after migrations have completed
    await settingsService.addSettingTab();

    // Create handlers with constructor injection
    this.stopStreamingHandler = new StopStreamingHandler(this.services);
    this.chatHandler = new ChatHandler(this.services, this.stopStreamingHandler);
    this.inferTitleHandler = new InferTitleHandler(this.services, this.stopStreamingHandler);
    this.modelSelectHandler = new ModelSelectHandler(this.services);

    // Register all commands
    this.registerCommands();

    // Expose the knowledge API and start the inbox watcher only when asked.
    const knowledgeSettings = settingsService.getSettings();
    if (knowledgeSettings.knowledgeEnabled) {
      this.knowledgeApi = this.services.knowledgeImportService.knowledgeApi();
      if (knowledgeSettings.knowledgeWatchInbox) {
        this.services.knowledgeImportService.startWatching();
      }
    }

    // Initialize available models after registry is created, but don't block startup
    // Run model initialization in the background
    this.modelSelectHandler.initializeAvailableModels().catch((error) => {
      Logger.error("[ChatGPT MD] Error initializing models in background", { error });
    });
  }

  /**
   * Register all plugin commands
   */
  private registerCommands(): void {
    const registrar = new CommandRegistrar(this);

    registrar.registerEditorViewCommand(this.chatHandler);
    registrar.registerEditorViewCommand(this.modelSelectHandler);

    // Add divider command
    registrar.registerEditorCommand(new AddDividerHandler(this.services));

    // Add comment block command
    registrar.registerEditorCommand(new AddCommentBlockHandler(this.services));

    // Stop streaming command
    registrar.registerCallbackCommand(this.stopStreamingHandler);

    // Infer title command
    registrar.registerEditorViewCommand(this.inferTitleHandler);

    // Move to new chat command
    registrar.registerEditorCommand(new MoveToNewChatHandler(this.services));

    // Choose chat template command
    registrar.registerCallbackCommand(new ChooseChatTemplateHandler(this.services));

    // Clear chat command
    registrar.registerEditorCommand(new ClearChatHandler(this.services));

    // Agent commands
    registrar.registerCallbackCommand(new ChooseAgentHandler(this.services));
    registrar.registerCallbackCommand(new CreateAgentHandler(this.services, this.modelSelectHandler));

    // Knowledge importer commands (only when the feature is enabled)
    this.registerKnowledgeCommands(registrar);
  }

  /**
   * The importer is opt-in: users who never enable it see no extra commands
   * and the plugin does no additional work at startup.
   */
  private registerKnowledgeCommands(registrar: CommandRegistrar): void {
    if (!this.services.settingsService.getSettings().knowledgeEnabled) return;

    [
      new ImportChatGPTHistoryHandler(this.services),
      new ResumeKnowledgeImportHandler(this.services),
      new ProcessChatGPTInboxHandler(this.services),
      new WatchChatGPTInboxHandler(this.services),
      new StopWatchingChatGPTInboxHandler(this.services),
      new RetryFailedConversationsHandler(this.services),
      new ReprocessConversationHandler(this.services),
      new ReprocessAllHandler(this.services),
      new RebuildKnowledgeIndexHandler(this.services),
      new ViewKnowledgeStatusHandler(this.services),
      new OpenReviewQueueHandler(this.services),
      new DryRunRoutingHandler(this.services),
      new ConfigureVaultRouterHandler(this.services),
      // Commands that point away from the archive: challenge a story, open the
      // horizon, resurface something old, retire a reading that stopped fitting.
      new ChallengeCurrentStoryHandler(this.services),
      new OpenHorizonHandler(this.services),
      new ShowSomethingForgottenHandler(this.services),
      new UnexpectedConnectionHandler(this.services),
      new ReviewPersonalModelsHandler(this.services),
      // Orchestration: one knowledge system across the plugins each vault has.
      new PluginIntegrationStatusHandler(this.services),
      new RefreshPluginCapabilitiesHandler(this.services),
      new OpenKnowledgeHomeHandler(this.services),
      new WriteSystemStatusHandler(this.services),
      new GenerateCanvasesHandler(this.services),
      new InstallTemplatesHandler(this.services),
      new EnsureProjectContextHandler(this.services),
      new ValidateKnowledgeGraphHandler(this.services),
      // Manual capture: the same structure the importer writes into.
      ...CAPTURE_KINDS.map((kind) => new CaptureHandler(this.services, kind)),
    ].forEach((handler) => registrar.registerCallbackCommand(handler));

    registrar.registerEditorCommand(new EnoughAnalysisHandler(this.services));
  }

  onunload(): void {
    this.services?.knowledgeImportService?.stopWatching();
  }
}
