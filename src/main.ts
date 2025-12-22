import { Plugin } from "obsidian";
import { ServiceLocator } from "./core/ServiceLocator";
import { CommandRegistry } from "./core/CommandRegistry";

export default class ChatGPT_MD extends Plugin {
  private serviceLocator: ServiceLocator;
  private commandRegistry: CommandRegistry;

  async onload() {
    // Initialize service locator with plugin instance
    this.serviceLocator = new ServiceLocator(this.app, this);

    // Get settings service and ensure migrations run first
    const settingsService = this.serviceLocator.getSettingsService();
    await settingsService.loadSettings();
    await settingsService.migrateSettings();

    // Add settings tab after migrations have completed
    await settingsService.addSettingTab();

    // Initialize command registry with services
    this.commandRegistry = new CommandRegistry(this, this.serviceLocator, settingsService);
    // Register it with ServiceLocator so other services can access it
    this.serviceLocator.setCommandRegistry(this.commandRegistry);
    this.commandRegistry.registerCommands();

    // Initialize available models after registry is created, but don't block startup
    // Run model initialization in the background
    this.commandRegistry.initializeAvailableModels().catch((error) => {
      console.error("[ChatGPT MD] Error initializing models in background:", error);
    });
  }
}
