import { Plugin } from "obsidian";
import { PluginInitializer } from "./core/PluginInitializer";
import { ServiceLocator } from "./core/ServiceLocator";
import { CommandRegistry } from "./core/CommandRegistry";
import { SettingsManager } from "./core/SettingsManager";

export default class ChatGPT_MD extends Plugin {
  private serviceLocator: ServiceLocator;
  private commandRegistry: CommandRegistry;
  private settingsManager: SettingsManager;

  async onload() {
    // Initialize the plugin using the PluginInitializer
    const pluginInitializer = new PluginInitializer(this);
    const { serviceLocator, commandRegistry, settingsManager } = await pluginInitializer.initialize();

    // Store references to the core components
    this.serviceLocator = serviceLocator;
    this.commandRegistry = commandRegistry;
    this.settingsManager = settingsManager;
  }
}
