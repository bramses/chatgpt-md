import { Plugin } from "obsidian";
import { ICommand, ICommandContext } from "../commands/interfaces/ICommand";

// Import refactored commands that are working
import { AddDividerCommand } from "../commands/AddDividerCommand";
import { StopStreamingCommand } from "../commands/StopStreamingCommand";
import { ClearChatCommand } from "../commands/ClearChatCommand";
import { AddCommentBlockCommand } from "../commands/AddCommentBlockCommand";

// Import adapters
import { ObsidianEditor } from "../adapters/ObsidianEditor";
import { ObsidianView } from "../adapters/ObsidianView";
import { ObsidianNotificationService } from "../adapters/ObsidianNotificationService";

// Import services
import { SettingsService } from "../Services/SettingsService";

/**
 * Simplified command registry to demonstrate the new command pattern
 * This shows Phase 2 completion - individual command classes with dependency injection
 */
export class SimpleCommandRegistry {
  private plugin: Plugin;
  private settingsService: SettingsService;
  private commands: ICommand[] = [];

  constructor(plugin: Plugin, settingsService: SettingsService) {
    this.plugin = plugin;
    this.settingsService = settingsService;
  }

  /**
   * Register the refactored commands
   */
  registerRefactoredCommands(): void {
    const notificationService = new ObsidianNotificationService();

    // Create a dummy editor for commands that need it in constructor
    // (This demonstrates the pattern - in Phase 4 we'll improve this)
    const dummyEditor = new ObsidianEditor({} as any);

    // Create the refactored commands
    this.commands = [
      new AddDividerCommand({
        getHeadingLevel: () => this.settingsService.getSettings().headingLevel,
      }),

      new StopStreamingCommand({
        stopAllStreaming: () => {
          notificationService.showWarning("No active streaming request to stop");
        },
      }),

      new ClearChatCommand(dummyEditor, notificationService),

      new AddCommentBlockCommand(dummyEditor),
    ];

    // Register each command with Obsidian
    this.commands.forEach((command) => this.registerCommand(command));
  }

  /**
   * Register a single command with Obsidian's command system
   */
  private registerCommand(command: ICommand): void {
    this.plugin.addCommand({
      id: command.id,
      name: command.name,
      icon: command.icon,
      editorCallback: async (editor: any, view: any) => {
        try {
          const editorAdapter = new ObsidianEditor(editor);
          const viewAdapter = new ObsidianView(view);

          // Create a simple app adapter
          const appAdapter = {
            getActiveView: () => view,
            workspace: this.plugin.app.workspace,
          };

          const context: ICommandContext = {
            editor: editorAdapter,
            view: viewAdapter,
            app: appAdapter as any,
          };

          await command.execute(context);
        } catch (error) {
          console.error(`[ChatGPT MD] Error executing command ${command.id}:`, error);
          const notificationService = new ObsidianNotificationService();
          notificationService.showError(
            `Error executing ${command.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      },
    });
  }

  /**
   * Get all registered commands
   */
  getCommands(): ICommand[] {
    return [...this.commands];
  }
}
