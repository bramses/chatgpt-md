import { Plugin } from "obsidian";
import { ICommand, CommandContext } from "../../commands/interfaces/ICommand";
import { SettingsManager } from "./SettingsManager";
import { EditorManager } from "./EditorManager";
import { AIProviderManager } from "./AIProviderManager";

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
        editorCallback: async (editor, view) => {
          try {
            const markdownView = view && "getViewType" in view ? view : undefined;
            await config.command.execute({
              editor,
              view: markdownView,
              plugin: this.plugin,
            });
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
            await config.command.execute({
              plugin: this.plugin,
            });
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
// These replace the complex command structure with direct implementations

/**
 * Simplified Chat Command
 */
class SimpleChatCommand implements ICommand {
  constructor(
    private deps: CommandDependencies,
    private statusBar?: HTMLElement
  ) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Chat command requires editor and view");
    }

    try {
      // Update status
      this.updateStatus("Processing...");

      // Get frontmatter and messages
      const settings = this.deps.settings.getSettings();
      const frontmatter = this.deps.editor.getFrontmatter(context.view, settings);
      const { messagesWithRole } = await this.deps.editor.getMessages(context.editor, settings);

      // Position cursor if not generating at cursor
      if (!settings.generateAtCursor) {
        this.deps.editor.moveCursorToEnd(context.editor);
      }

      // Determine AI service and ensure it's supported
      const aiServiceName = frontmatter.aiService || "openai";
      console.log(`[ChatGPT MD] Using AI service: ${aiServiceName}, streaming: ${frontmatter.stream}`);

      // Call AI provider
      const response = frontmatter.stream
        ? await this.deps.ai.streamChat(aiServiceName, messagesWithRole, frontmatter, context.editor)
        : await this.deps.ai.chat(aiServiceName, messagesWithRole, frontmatter);

      // Process response using the correct method that matches original behavior
      this.deps.editor.processResponse(context.editor, response, settings);

      this.updateStatus("");
    } catch (error) {
      this.updateStatus("");
      console.error("[ChatGPT MD] Chat error:", error);
      throw error;
    }
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
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Select model command requires editor");
    }

    // For now, just update frontmatter with a default model
    // TODO: Implement model selection UI
    this.deps.editor.updateFrontmatterField(context.editor, "model", "gpt-4o-mini");
  }
}

/**
 * Simplified Infer Title Command
 */
class SimpleInferTitleCommand implements ICommand {
  constructor(
    private deps: CommandDependencies,
    private statusBar?: HTMLElement
  ) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor || !context.view) {
      throw new Error("Infer title command requires editor and view");
    }

    try {
      this.updateStatus("Inferring title...");

      const settings = this.deps.settings.getSettings();
      const frontmatter = this.deps.editor.getFrontmatter(context.view, settings);
      const { messages } = await this.deps.editor.getMessages(context.editor, settings);

      const title = await this.deps.ai.inferTitle(frontmatter.aiService || "openai", messages, frontmatter);

      if (title) {
        await this.deps.editor.writeInferredTitle(context.view, title);
      }

      this.updateStatus("");
    } catch (error) {
      this.updateStatus("");
      console.error("[ChatGPT MD] Infer title error:", error);
      throw error;
    }
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
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Add divider command requires editor");
    }

    const settings = this.deps.settings.getSettings();
    this.deps.editor.addHorizontalRule(context.editor, "user", settings.headingLevel);
  }
}

/**
 * Simplified Add Comment Block Command
 */
class SimpleAddCommentBlockCommand implements ICommand {
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Add comment block command requires editor");
    }

    this.deps.editor.addCommentBlock(context.editor);
  }
}

/**
 * Simplified Stop Streaming Command
 */
class SimpleStopStreamingCommand implements ICommand {
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    this.deps.ai.stopAllStreaming();
  }
}

/**
 * Simplified Move to New Chat Command
 */
class SimpleMoveToNewChatCommand implements ICommand {
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Move to new chat command requires editor");
    }

    // TODO: Implement highlighted text extraction and new chat creation
    console.log("[ChatGPT MD] Move to new chat - not yet implemented in simplified architecture");
  }
}

/**
 * Simplified Choose Chat Template Command
 */
class SimpleChooseChatTemplateCommand implements ICommand {
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    // TODO: Implement template selection and new chat creation
    console.log("[ChatGPT MD] Choose chat template - not yet implemented in simplified architecture");
  }
}

/**
 * Simplified Clear Chat Command
 */
class SimpleClearChatCommand implements ICommand {
  constructor(private deps: CommandDependencies) {}

  async execute(context: CommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Clear chat command requires editor");
    }

    this.deps.editor.clearChat(context.editor);
  }
}
