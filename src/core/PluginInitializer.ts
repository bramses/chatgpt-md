import { Plugin } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ServiceLocator } from "./ServiceLocator";
import { CommandRegistry } from "./CommandRegistry";
import { SettingsManager } from "./SettingsManager";
import { ChatGPT_MDSettingsTab } from "src/Views/ChatGPT_MDSettingsTab";

/**
 * Handles the initialization of the plugin
 */
export class PluginInitializer {
  private plugin: Plugin;
  private serviceLocator: ServiceLocator;
  private commandRegistry: CommandRegistry;
  private settingsManager: SettingsManager;
  private statusBarItemEl: HTMLElement;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.statusBarItemEl = plugin.addStatusBarItem();
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<{
    serviceLocator: ServiceLocator;
    commandRegistry: CommandRegistry;
    settingsManager: SettingsManager;
  }> {
    // Initialize settings manager
    this.settingsManager = new SettingsManager(this.plugin);
    const settings = await this.settingsManager.loadSettings();

    // Initialize service locator with settings
    this.serviceLocator = new ServiceLocator(this.plugin.app, settings);

    // Initialize command registry
    this.commandRegistry = new CommandRegistry(
      this.plugin,
      this.serviceLocator,
      this.settingsManager,
      this.updateStatusBar.bind(this)
    );

    // Register commands
    this.commandRegistry.registerCommands();

    // Add settings tab
    this.plugin.addSettingTab(
      new ChatGPT_MDSettingsTab(this.plugin.app, this.plugin, {
        settings: this.settingsManager.getSettings(),
        saveSettings: this.settingsManager.saveSettings.bind(this.settingsManager),
      })
    );

    return {
      serviceLocator: this.serviceLocator,
      commandRegistry: this.commandRegistry,
      settingsManager: this.settingsManager,
    };
  }

  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
