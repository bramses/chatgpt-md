import { Plugin } from "obsidian";
import { ServiceLocator } from "./core/ServiceLocator";
import { CommandRegistry } from "./core/CommandRegistry";
import { SettingsManager } from "./core/SettingsManager";
import { ChatGPT_MDSettingsTab } from "./Views/ChatGPT_MDSettingsTab";

export default class ChatGPT_MD extends Plugin {
  private serviceLocator: ServiceLocator;
  private commandRegistry: CommandRegistry;
  private settingsManager: SettingsManager;

  async onload() {
    // Initialize the plugin using the PluginInitializer

    // Initialize settings manager
    this.settingsManager = new SettingsManager(this);
    const settings = await this.settingsManager.loadSettings();

    // Initialize service locator with settings
    this.serviceLocator = new ServiceLocator(this.app, settings);

    // Initialize command registry
    this.commandRegistry = new CommandRegistry(this, this.serviceLocator, this.settingsManager);

    // Register commands
    this.commandRegistry.registerCommands();

    // Add settings tab
    this.addSettingTab(
      new ChatGPT_MDSettingsTab(this.app, this, {
        settings: this.settingsManager.getSettings(),
        saveSettings: this.settingsManager.saveSettings.bind(this.settingsManager),
      })
    );
  }
}
