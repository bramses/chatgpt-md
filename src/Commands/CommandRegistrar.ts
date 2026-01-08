import { Editor, MarkdownView, Plugin } from "obsidian";
import { CallbackCommandHandler, EditorCommandHandler, EditorViewCommandHandler } from "./CommandHandler";

/**
 * Command registrar utility for simplifying command registration
 * Reduces boilerplate in main.ts
 */
export class CommandRegistrar {
  constructor(private plugin: Plugin) {}

  /**
   * Register an editor-based command
   */
  registerEditorCommand(handler: EditorCommandHandler): void {
    const metadata = handler.getCommand();
    this.plugin.addCommand({
      ...metadata,
      editorCallback: (editor: Editor, _view: MarkdownView) => handler.execute(editor),
    });
  }

  /**
   * Register an editor + view based command
   */
  registerEditorViewCommand(handler: EditorViewCommandHandler): void {
    const metadata = handler.getCommand();
    this.plugin.addCommand({
      ...metadata,
      editorCallback: (editor: Editor, view: MarkdownView) => handler.execute(editor, view),
    });
  }

  /**
   * Register a callback-only command (no editor)
   */
  registerCallbackCommand(handler: CallbackCommandHandler): void {
    const metadata = handler.getCommand();
    this.plugin.addCommand({
      ...metadata,
      callback: () => handler.execute(),
    });
  }
}
