import { Plugin, Editor, MarkdownView } from "obsidian";
import { ICommand, ICommandContext } from "../../commands/interfaces/ICommand";
import { SettingsManager } from "./SettingsManager";
import { EditorManager } from "./EditorManager";
import { AIProviderManager } from "./AIProviderManager";
import { ObsidianEditor } from "../../adapters/ObsidianEditor";
import { ObsidianView } from "../../adapters/ObsidianView";

// Command configuration interface
interface CommandConfig {
  id: string;
  name: string;
  icon?: string;
  editorRequired?: boolean;
  command: ICommand;
}

// Dependencies interface for easier testing
interface CommandDependencies {
  settings: SettingsManager;
  editor: EditorManager;
  ai: AIProviderManager;
}

/**
 * CommandManager - Simplified command management
 *
 * Focuses on command registration and execution without complex dependencies.
 * Commands are created with direct manager dependencies for easier testing.
 */
export class CommandManager {
  private commands = new Map<string, ICommand>();
  private statusBarElement?: HTMLElement;

  constructor(
    private plugin: Plugin,
    private dependencies: CommandDependencies
  ) {
    this.statusBarElement = plugin.addStatusBarItem();
    this.registerAllCommands();
  }

  /**
   * Register all commands
   */
  private registerAllCommands(): void {
    const commandConfigs: CommandConfig[] = [
      {
        id: "call-chatgpt-api",
        name: "Chat",
        icon: "message-circle",
        editorRequired: true,
        command: new SimpleChatCommand(this.dependencies, this.statusBarElement),
      },
      {
        id: "select-model-command",
        name: "Select Model",
        icon: "list",
        editorRequired: true,
        command: new SimpleSelectModelCommand(this.dependencies),
      },
      {
        id: "infer-title",
        name: "Infer title",
        icon: "subtitles",
        editorRequired: true,
        command: new SimpleInferTitleCommand(this.dependencies, this.statusBarElement),
      },
      {
        id: "add-hr",
        name: "Add divider",
        icon: "minus",
        editorRequired: true,
        command: new SimpleAddDividerCommand(this.dependencies),
      },
      {
        id: "add-comment-block",
        name: "Add comment block",
        icon: "comment",
        editorRequired: true,
        command: new SimpleAddCommentBlockCommand(this.dependencies),
      },
      {
        id: "stop-streaming",
        name: "Stop streaming",
        icon: "octagon",
        editorRequired: false,
        command: new SimpleStopStreamingCommand(this.dependencies),
      },
      {
        id: "move-to-chat",
        name: "Create new chat with highlighted text",
        icon: "highlighter",
        editorRequired: true,
        command: new SimpleMoveToNewChatCommand(this.dependencies),
      },
      {
        id: "choose-chat-template",
        name: "Create new chat from template",
        icon: "layout-template",
        editorRequired: false,
        command: new SimpleChooseChatTemplateCommand(this.dependencies),
      },
      {
        id: "clear-chat",
        name: "Clear chat (except frontmatter)",
        icon: "trash",
        editorRequired: true,
        command: new SimpleClearChatCommand(this.dependencies),
      },
    ];

    // Register each command
    for (const config of commandConfigs) {
      this.registerCommand(config);
    }
  }

  /**
   * Register a single command
   */
  private registerCommand(config: CommandConfig): void {
    this.commands.set(config.id, config.command);

    if (config.editorRequired) {
      this.plugin.addCommand({
        id: config.id,
        name: config.name,
        icon: config.icon,
        editorCallback: async (editor: Editor, view: MarkdownView) => {
          try {
            const context: ICommandContext = {
              editor: new ObsidianEditor(editor),
              view: view ? new ObsidianView(view) : undefined,
              app: this.plugin.app as any, // TODO: Create ObsidianApp adapter
            };
            await config.command.execute(context);
          } catch (error) {
            console.error(`[ChatGPT MD] Error executing command ${config.name}:`, error);
          }
        },
      });
    } else {
      this.plugin.addCommand({
        id: config.id,
        name: config.name,
        icon: config.icon,
        callback: async () => {
          try {
            const context: ICommandContext = {
              app: this.plugin.app as any, // TODO: Create ObsidianApp adapter
            };
            await config.command.execute(context);
          } catch (error) {
            console.error(`[ChatGPT MD] Error executing command ${config.name}:`, error);
          }
        },
      });
    }
  }

  /**
   * Get a command by ID (useful for testing)
   */
  getCommand(id: string): ICommand | undefined {
    return this.commands.get(id);
  }

  /**
   * Update status bar
   */
  updateStatusBar(text: string): void {
    if (this.statusBarElement) {
      this.statusBarElement.setText(text ? `[ChatGPT MD] ${text}` : "");
    }
  }
}

// ===== SIMPLIFIED COMMAND IMPLEMENTATIONS =====
// These are temporary implementations that will be replaced with proper command classes

/**
 * Simplified Chat Command
 */
class SimpleChatCommand implements ICommand {
  id = "call-chatgpt-api";
  name = "Chat";
  icon = "message-circle";

  constructor(
    private deps: CommandDependencies,
    private statusBar?: HTMLElement
  ) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Chat command requires editor and view");
    }

    // TODO: Implement using the new abstraction layer
    console.log("[ChatGPT MD] Chat command - to be implemented with new architecture");
  }

  private updateStatus(text: string): void {
    if (this.statusBar) {
      this.statusBar.setText(text ? `[ChatGPT MD] ${text}` : "");
    }
  }
}

/**
 * Simplified Select Model Command
 */
class SimpleSelectModelCommand implements ICommand {
  id = "select-model-command";
  name = "Select Model";
  icon = "list";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Select model command requires editor");
    }

    // TODO: Implement model selection UI with new architecture
    console.log("[ChatGPT MD] Select model command - to be implemented");
  }
}

/**
 * Simplified Infer Title Command
 */
class SimpleInferTitleCommand implements ICommand {
  id = "infer-title";
  name = "Infer title";
  icon = "subtitles";

  constructor(
    private deps: CommandDependencies,
    private statusBar?: HTMLElement
  ) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Infer title command requires editor and view");
    }

    // TODO: Implement with new architecture
    console.log("[ChatGPT MD] Infer title command - to be implemented");
  }

  private updateStatus(text: string): void {
    if (this.statusBar) {
      this.statusBar.setText(text ? `[ChatGPT MD] ${text}` : "");
    }
  }
}

/**
 * Simplified Add Divider Command
 */
class SimpleAddDividerCommand implements ICommand {
  id = "add-hr";
  name = "Add divider";
  icon = "minus";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Add divider command requires editor");
    }

    // TODO: Implement with new architecture
    console.log("[ChatGPT MD] Add divider command - to be implemented");
  }
}

/**
 * Simplified Add Comment Block Command
 */
class SimpleAddCommentBlockCommand implements ICommand {
  id = "add-comment-block";
  name = "Add comment block";
  icon = "comment";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Add comment block command requires editor");
    }

    // TODO: Implement with new architecture
    console.log("[ChatGPT MD] Add comment block command - to be implemented");
  }
}

/**
 * Simplified Stop Streaming Command
 */
class SimpleStopStreamingCommand implements ICommand {
  id = "stop-streaming";
  name = "Stop streaming";
  icon = "octagon";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    this.deps.ai.stopAllStreaming();
  }
}

/**
 * Simplified Move to New Chat Command
 */
class SimpleMoveToNewChatCommand implements ICommand {
  id = "move-to-chat";
  name = "Create new chat with highlighted text";
  icon = "highlighter";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Move to new chat command requires editor");
    }

    // TODO: Implement with new architecture
    console.log("[ChatGPT MD] Move to new chat command - to be implemented");
  }
}

/**
 * Simplified Choose Chat Template Command
 */
class SimpleChooseChatTemplateCommand implements ICommand {
  id = "choose-chat-template";
  name = "Create new chat from template";
  icon = "layout-template";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    // TODO: Implement with new architecture
    console.log("[ChatGPT MD] Choose chat template command - to be implemented");
  }
}

/**
 * Simplified Clear Chat Command
 */
class SimpleClearChatCommand implements ICommand {
  id = "clear-chat";
  name = "Clear chat (except frontmatter)";
  icon = "trash";

  constructor(private deps: CommandDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Clear chat command requires editor");
    }

    // TODO: Implement with new architecture
    console.log("[ChatGPT MD] Clear chat command - to be implemented");
  }
}
