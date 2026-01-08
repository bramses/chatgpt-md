import { Plugin } from "obsidian";

/**
 * Command metadata interface
 */
export interface CommandMetadata {
  id: string;
  name: string;
  icon: string;
}

/**
 * Base interface for command handlers
 * All command handlers must implement this contract
 */
export interface CommandHandler {
  /**
   * Get command metadata for registration
   */
  getCommand(): CommandMetadata;
}

/**
 * Interface for editor-based commands
 */
export interface EditorCommandHandler extends CommandHandler {
  execute(editor: import("obsidian").Editor): void | Promise<void>;
}

/**
 * Interface for editor + view based commands
 */
export interface EditorViewCommandHandler extends CommandHandler {
  execute(editor: import("obsidian").Editor, view: import("obsidian").MarkdownView): void | Promise<void>;
}

/**
 * Interface for callback-only commands (no editor)
 */
export interface CallbackCommandHandler extends CommandHandler {
  execute(): void | Promise<void>;
}

/**
 * Status bar manager for command handlers
 * Provides reusable status bar functionality
 */
export class StatusBarManager {
  private statusBarItemEl: HTMLElement;

  constructor(plugin: Plugin) {
    this.statusBarItemEl = plugin.addStatusBarItem();
  }

  /**
   * Update status bar text
   */
  setText(text: string): void {
    this.statusBarItemEl.setText(text);
  }

  /**
   * Clear status bar text
   */
  clear(): void {
    this.statusBarItemEl.setText("");
  }
}
