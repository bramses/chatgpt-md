import { Plugin, Editor, MarkdownView } from "obsidian";
import { ICommand, ICommandContext } from "../commands/interfaces/ICommand";
import { Container, TOKENS } from "./Container";
import { ObsidianEditor } from "../adapters/ObsidianEditor";
import { ObsidianView } from "../adapters/ObsidianView";

/**
 * NewCommandRegistry - Simplified command registration using the command pattern
 *
 * This registry:
 * - Uses dependency injection for all commands
 * - Provides clear separation between Obsidian API and business logic
 * - Makes commands easily testable
 * - Reduces complexity compared to the original CommandRegistry
 */
export class NewCommandRegistry {
  private commands = new Map<string, ICommand>();

  constructor(
    private plugin: Plugin,
    private container: Container
  ) {}

  /**
   * Register a command
   */
  register(command: ICommand): void {
    this.commands.set(command.id, command);

    // Register with Obsidian
    this.plugin.addCommand({
      id: command.id,
      name: command.name,
      icon: command.icon,
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const context = this.createContext(editor, view);
        await this.executeCommand(command, context);
      },
      callback: async () => {
        // For commands that don't require an editor
        const context = this.createContext();
        await this.executeCommand(command, context);
      },
    });
  }

  /**
   * Register all commands
   */
  registerAllCommands(): void {
    // Example of registering commands with proper dependency injection
    // Each command gets only the dependencies it needs

    // Add Divider Command
    const addDividerCommand = this.container.resolve(TOKENS.AddDividerCommand);
    if (addDividerCommand) {
      this.register(addDividerCommand);
    }

    // Add more commands as they are refactored...
    // this.register(this.container.resolve(TOKENS.ChatCommand));
    // this.register(this.container.resolve(TOKENS.InferTitleCommand));
    // etc.
  }

  /**
   * Execute a command with error handling
   */
  private async executeCommand(command: ICommand, context: ICommandContext): Promise<void> {
    try {
      await command.execute(context);
    } catch (error) {
      console.error(`[ChatGPT MD] Error executing command ${command.name}:`, error);
      const notificationService = this.container.resolve(TOKENS.NotificationService);
      notificationService?.showError(`Command failed: ${error.message}`);
    }
  }

  /**
   * Create command context with proper abstractions
   */
  private createContext(editor?: Editor, view?: MarkdownView): ICommandContext {
    return {
      editor: editor ? new ObsidianEditor(editor) : undefined,
      view: view ? new ObsidianView(view) : undefined,
      app: this.plugin.app as any, // TODO: Create ObsidianApp adapter
    };
  }

  /**
   * Get a command by ID (useful for testing)
   */
  getCommand(id: string): ICommand | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all registered commands
   */
  getAllCommands(): ICommand[] {
    return Array.from(this.commands.values());
  }
}
