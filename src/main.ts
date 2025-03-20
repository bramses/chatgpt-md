import { Plugin } from "obsidian";
import { ServiceLocator } from "./core/ServiceLocator";
import { CommandRegistry } from "./core/CommandRegistry";

export default class ChatGPT_MD extends Plugin {
  private serviceLocator: ServiceLocator;
  private commandRegistry: CommandRegistry;

  async onload() {
    // Initialize service locator with plugin instance
    this.serviceLocator = new ServiceLocator(this.app, this);

    // Add settings tab using the service from ServiceLocator
    const settingsService = this.serviceLocator.getSettingsService();
    await settingsService.addSettingTab();

    // Initialize command registry with services
    this.commandRegistry = new CommandRegistry(this, this.serviceLocator, settingsService);
    this.commandRegistry.registerCommands();
  }
}
