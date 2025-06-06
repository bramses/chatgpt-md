import { App, Plugin } from "obsidian";
import { SettingsManager } from "./managers/SettingsManager";
import { EditorManager } from "./managers/EditorManager";
import { AIProviderManager } from "./managers/AIProviderManager";
import { CommandManager } from "./managers/CommandManager";

/**
 * ChatGPTCore - Simplified core architecture
 *
 * Replaces the complex Container + ServiceRegistration pattern with a simple,
 * focused core that manages four key managers. This provides clear dependency
 * boundaries and makes the system much easier to understand and test.
 */
export class ChatGPTCore {
  private managers: {
    settings: SettingsManager;
    editor: EditorManager;
    ai: AIProviderManager;
    commands: CommandManager;
  };

  constructor(
    private app: App,
    private plugin: Plugin
  ) {
    this.managers = this.createManagers();
  }

  /**
   * Initialize the core and all managers
   */
  async initialize(): Promise<void> {
    try {
      console.log("[ChatGPT MD] Initializing simplified core...");

      // Initialize settings first (load and migrate)
      await this.managers.settings.initialize();

      // Add settings tab
      this.managers.settings.addSettingTab();

      console.log("[ChatGPT MD] Simplified core initialized successfully");
    } catch (error) {
      console.error("[ChatGPT MD] Failed to initialize simplified core:", error);
      throw error;
    }
  }

  /**
   * Get a specific manager
   */
  get<T extends keyof typeof this.managers>(name: T): (typeof this.managers)[T] {
    return this.managers[name];
  }

  /**
   * Get all managers (useful for testing)
   */
  getManagers() {
    return this.managers;
  }

  /**
   * Create all managers with proper dependency injection
   */
  private createManagers() {
    // Create managers in dependency order
    const settings = new SettingsManager(this.plugin);
    const editor = new EditorManager(this.app);
    const ai = new AIProviderManager(settings);
    const commands = new CommandManager(this.plugin, { settings, editor, ai });

    return { settings, editor, ai, commands };
  }

  /**
   * Shutdown core and cleanup resources
   */
  cleanup(): void {
    try {
      // Stop any ongoing AI operations
      this.managers.ai.stopAllStreaming();

      console.log("[ChatGPT MD] Core cleanup completed");
    } catch (error) {
      console.error("[ChatGPT MD] Error during core cleanup:", error);
    }
  }
}

/**
 * Type-safe manager access helper
 */
export type CoreManager = keyof ChatGPTCore["managers"];

/**
 * Utility function to create a properly configured core
 */
export function createChatGPTCore(app: App, plugin: Plugin): ChatGPTCore {
  return new ChatGPTCore(app, plugin);
}
