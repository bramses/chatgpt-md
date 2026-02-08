import { MarkdownView, Plugin } from "obsidian";
import { ServiceContainer } from "./core/ServiceContainer";
import { ChatHandler } from "./Commands/ChatHandler";
import { ModelSelectHandler } from "./Commands/ModelSelectHandler";
import { AddCommentBlockHandler, AddDividerHandler } from "./Commands/SimpleHandlers";
import { StopStreamingHandler } from "./Commands/StopStreamingHandler";
import { InferTitleHandler } from "./Commands/InferTitleHandler";
import { ChooseChatTemplateHandler, ClearChatHandler, MoveToNewChatHandler } from "./Commands/RemainingHandlers";
import { CommandRegistrar } from "./Commands/CommandRegistrar";

export default class ChatGPT_MD extends Plugin {
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

    // Add settings tab after migrations have completed
    await settingsService.addSettingTab();

    // Create handlers with constructor injection
    this.stopStreamingHandler = new StopStreamingHandler(this.services);
    this.chatHandler = new ChatHandler(this.services, this.stopStreamingHandler);
    this.inferTitleHandler = new InferTitleHandler(this.services, this.stopStreamingHandler);
    this.modelSelectHandler = new ModelSelectHandler(this.services);

    // Register all commands
    this.registerCommands();

    // Initialize available models after registry is created, but don't block startup
    // Run model initialization in the background
    this.modelSelectHandler.initializeAvailableModels().catch((error) => {
      console.error("[ChatGPT MD] Error initializing models in background:", error);
    });
  }

  /**
   * Register all plugin commands
   */
  private registerCommands(): void {
    const registrar = new CommandRegistrar(this);

    // Chat command
    this.addCommand({
      ...ChatHandler.getCommand(),
      editorCallback: (editor, view) => {
        if (view instanceof MarkdownView) {
          this.chatHandler.execute(editor, view);
        }
      },
    });

    // Select model command
    this.addCommand({
      ...ModelSelectHandler.getCommand(),
      editorCallback: (editor, view) => {
        if (view instanceof MarkdownView) {
          this.modelSelectHandler.execute(editor, view);
        }
      },
    });

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
  }
}
