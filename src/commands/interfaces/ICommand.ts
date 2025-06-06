import { IEditor } from "../../core/abstractions/IEditor";
import { IView } from "../../core/abstractions/IView";
import { IApp } from "../../core/abstractions/IApp";

/**
 * Context provided to command execution
 */
export interface ICommandContext {
  editor?: IEditor;
  view?: IView;
  app: IApp;
}

/**
 * Interface for all commands in the plugin
 */
export interface ICommand {
  id: string;
  name: string;
  icon?: string;

  /**
   * Execute the command with the given context
   */
  execute(context: ICommandContext): Promise<void>;
}
