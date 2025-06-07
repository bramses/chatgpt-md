import { Plugin } from "obsidian";
import { ServiceLocator } from "./core/ServiceLocator";
import { IntegratedCommandRegistry } from "./core/IntegratedCommandRegistry";

export default class ChatGPT_MD extends Plugin {
  private serviceLocator: ServiceLocator;
  private commandRegistry: IntegratedCommandRegistry;

  async onload() {
    // Initialize service locator with plugin instance
    this.serviceLocator = new ServiceLocator(this.app, this);

    // Get settings service and ensure migrations run first
    const settingsService = this.serviceLocator.getSettingsService();
    await settingsService.loadSettings();
    await settingsService.migrateSettings();

    // Add settings tab after migrations have completed
    await settingsService.addSettingTab();

    // Initialize integrated command registry with refactored commands
    this.commandRegistry = new IntegratedCommandRegistry(this, this.serviceLocator, settingsService);
    this.commandRegistry.registerCommands();

    console.log("[ChatGPT MD] Plugin loaded with integrated command registry");
    console.log(`[ChatGPT MD] Refactored commands: ${this.commandRegistry.getRefactoredCommands().length}`);
  }
}
