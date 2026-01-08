import { Plugin } from "obsidian";
import { ServiceContainer } from "./core/ServiceContainer";
import { ChatHandler } from "./Commands/ChatHandler";
import { ModelSelectHandler } from "./Commands/ModelSelectHandler";
import { AddDividerHandler, AddCommentBlockHandler } from "./Commands/SimpleHandlers";
import { StopStreamingHandler } from "./Commands/StopStreamingHandler";
import { InferTitleHandler } from "./Commands/InferTitleHandler";
import { MoveToNewChatHandler, ChooseChatTemplateHandler, ClearChatHandler } from "./Commands/RemainingHandlers";

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
		// Chat command
		this.addCommand({
			...ChatHandler.getCommand(),
			editorCallback: (editor, view) => this.chatHandler.execute(editor, view),
		});

		// Select model command
		this.addCommand({
			...ModelSelectHandler.getCommand(),
			editorCallback: (editor, view) => this.modelSelectHandler.execute(editor, view),
		});

		// Add divider command
		const addDividerHandler = new AddDividerHandler(this.services);
		this.addCommand({
			...AddDividerHandler.getCommand(),
			editorCallback: (editor) => addDividerHandler.execute(editor),
		});

		// Add comment block command
		const addCommentBlockHandler = new AddCommentBlockHandler(this.services);
		this.addCommand({
			...AddCommentBlockHandler.getCommand(),
			editorCallback: (editor) => addCommentBlockHandler.execute(editor),
		});

		// Stop streaming command
		this.addCommand({
			...StopStreamingHandler.getCommand(),
			callback: () => this.stopStreamingHandler.execute(),
		});

		// Infer title command
		this.addCommand({
			...InferTitleHandler.getCommand(),
			editorCallback: (editor, view) => this.inferTitleHandler.execute(editor, view),
		});

		// Move to new chat command
		const moveToNewChatHandler = new MoveToNewChatHandler(this.services);
		this.addCommand({
			...MoveToNewChatHandler.getCommand(),
			editorCallback: (editor) => moveToNewChatHandler.execute(editor),
		});

		// Choose chat template command
		const chooseChatTemplateHandler = new ChooseChatTemplateHandler(this.services);
		this.addCommand({
			...ChooseChatTemplateHandler.getCommand(),
			callback: () => chooseChatTemplateHandler.execute(),
		});

		// Clear chat command
		const clearChatHandler = new ClearChatHandler(this.services);
		this.addCommand({
			...ClearChatHandler.getCommand(),
			editorCallback: (editor) => clearChatHandler.execute(editor),
		});
	}
}
