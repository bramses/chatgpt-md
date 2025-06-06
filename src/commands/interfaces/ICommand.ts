import { Editor, MarkdownView, Plugin } from "obsidian";

/**
 * Context provided to command execution
 */
export interface CommandContext {
  editor?: Editor;
  view?: MarkdownView;
  plugin: Plugin;
}

/**
 * Interface for all commands in the plugin
 */
export interface ICommand {
  /**
   * Execute the command with the given context
   */
  execute(context: CommandContext): Promise<void>;
}
