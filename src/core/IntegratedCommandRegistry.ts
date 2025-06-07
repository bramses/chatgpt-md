import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";
import { ServiceLocator } from "./ServiceLocator";
import { SettingsService } from "../Services/SettingsService";
import { ICommand, ICommandContext } from "../commands/interfaces/ICommand";

// Import refactored commands
import { AddDividerCommand } from "../commands/AddDividerCommand";
import { StopStreamingCommand } from "../commands/StopStreamingCommand";
import { ClearChatCommand } from "../commands/ClearChatCommand";
import { AddCommentBlockCommand } from "../commands/AddCommentBlockCommand";

// Import adapters
import { ObsidianEditor } from "../adapters/ObsidianEditor";
import { ObsidianView } from "../adapters/ObsidianView";
import { ObsidianNotificationService } from "../adapters/ObsidianNotificationService";

// Import constants
import {
  CALL_CHATGPT_API_COMMAND_ID,
  CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
  INFER_TITLE_COMMAND_ID,
  MOVE_TO_CHAT_COMMAND_ID,
} from "../Constants";
import { getHeadingPrefix } from "../Utilities/TextHelpers";
import { ApiAuthService } from "../Services/ApiAuthService";
import { DEFAULT_OPENAI_CONFIG } from "../Services/OpenAiService";
import { DEFAULT_OPENROUTER_CONFIG } from "../Services/OpenRouterService";
import { DEFAULT_OLLAMA_CONFIG } from "../Services/OllamaService";
import { DEFAULT_LMSTUDIO_CONFIG } from "../Services/LmStudioService";
import { DEFAULT_ANTHROPIC_CONFIG } from "../Services/AnthropicService";

/**
 * Integrated Command Registry that combines refactored commands with legacy commands
 * This provides Phase 4 integration while maintaining backward compatibility
 */
export class IntegratedCommandRegistry {
  private plugin: Plugin;
  private serviceLocator: ServiceLocator;
  private settingsService: SettingsService;
  private statusBarItemEl: HTMLElement;
  private apiAuthService: ApiAuthService;
  private refactoredCommands: ICommand[] = [];

  constructor(plugin: Plugin, serviceLocator: ServiceLocator, settingsService: SettingsService) {
    this.plugin = plugin;
    this.serviceLocator = serviceLocator;
    this.settingsService = settingsService;
    this.statusBarItemEl = plugin.addStatusBarItem();
    this.apiAuthService = new ApiAuthService();
  }

  /**
   * Register all commands
   */
  registerCommands(): void {
    // Register new refactored commands
    this.registerRefactoredCommands();

    // Register remaining legacy commands (temporarily)
    this.registerChatCommand();
    this.registerSelectModelCommand();
    this.registerInferTitleCommand();
    this.registerMoveToNewChatCommand();
    this.registerChooseChatTemplateCommand();
  }

  /**
   * Register the refactored commands using the new pattern
   */
  private registerRefactoredCommands(): void {
    const notificationService = new ObsidianNotificationService();
    const dummyEditor = new ObsidianEditor({} as any); // Temporary solution

    this.refactoredCommands = [
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

    // Register each refactored command
    this.refactoredCommands.forEach((command) => this.registerRefactoredCommand(command));
  }

  /**
   * Register a single refactored command
   */
  private registerRefactoredCommand(command: ICommand): void {
    this.plugin.addCommand({
      id: command.id,
      name: command.name,
      icon: command.icon,
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        try {
          const editorAdapter = new ObsidianEditor(editor);
          const viewAdapter = new ObsidianView(view);

          const context: ICommandContext = {
            editor: editorAdapter,
            view: viewAdapter,
            app: { getActiveView: () => view, workspace: this.plugin.app.workspace } as any,
          };

          await command.execute(context);
        } catch (error) {
          console.error(`[ChatGPT MD] Error executing refactored command ${command.id}:`, error);
          const notificationService = new ObsidianNotificationService();
          notificationService.showError(
            `Error executing ${command.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      },
    });
  }

  // LEGACY COMMANDS (to be refactored in future phases)

  /**
   * Register the main chat command (legacy version for now)
   */
  private registerChatCommand(): void {
    this.plugin.addCommand({
      id: CALL_CHATGPT_API_COMMAND_ID,
      name: "Chat",
      icon: "message-circle",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        // Use legacy implementation for now
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();
        const frontmatter = editorService.getFrontmatter(view, settings, this.plugin.app);

        // TODO: Replace with ChatUseCase integration
        const aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

        try {
          const { messagesWithRole: messagesWithRoleAndMessage } = await editorService.getMessagesFromEditor(
            editor,
            settings
          );

          if (!settings.generateAtCursor) {
            editorService.moveCursorToEnd(editor);
          }

          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
          } else {
            this.updateStatusBar(`Calling ${frontmatter.model}`);
          }

          const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);

          const response = await aiService.callAIAPI(
            messagesWithRoleAndMessage,
            frontmatter,
            getHeadingPrefix(settings.headingLevel),
            this.getAiApiUrls(frontmatter)[frontmatter.aiService],
            editor,
            settings.generateAtCursor,
            apiKeyToUse,
            settings
          );

          editorService.processResponse(editor, response, settings);
        } catch (err) {
          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Error: ${err}`, 9000);
          }
          console.log(err);
        }

        this.updateStatusBar("");
      },
    });
  }

  /**
   * Register the select model command (legacy version for now)
   */
  private registerSelectModelCommand(): void {
    this.plugin.addCommand({
      id: "select-model-command",
      name: "Select Model",
      icon: "list",
      editorCallback: async (_editor: Editor, _view: MarkdownView) => {
        // TODO: Replace with SelectModelCommand integration
        new Notice("[ChatGPT MD] Model selection temporarily disabled during refactoring");
      },
    });
  }

  /**
   * Register the infer title command (legacy version for now)
   */
  private registerInferTitleCommand(): void {
    this.plugin.addCommand({
      id: INFER_TITLE_COMMAND_ID,
      name: "Infer title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        // TODO: Replace with InferTitleCommand integration
        new Notice("[ChatGPT MD] Title inference temporarily disabled during refactoring");
      },
    });
  }

  /**
   * Register the move to new chat command (legacy version for now)
   */
  private registerMoveToNewChatCommand(): void {
    this.plugin.addCommand({
      id: MOVE_TO_CHAT_COMMAND_ID,
      name: "Create new chat with highlighted text",
      icon: "highlighter",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        try {
          await editorService.createNewChatWithHighlightedText(editor, settings);
        } catch (err) {
          console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
          new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
        }
      },
    });
  }

  /**
   * Register the choose chat template command (legacy version for now)
   */
  private registerChooseChatTemplateCommand(): void {
    this.plugin.addCommand({
      id: CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
      name: "Create new chat from template",
      icon: "layout-template",
      callback: async () => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        if (settings.dateFormat) {
          await editorService.createNewChatFromTemplate(
            settings,
            editorService.getDate(new Date(), settings.dateFormat)
          );
          return;
        }
        new Notice(
          "date format cannot be empty in your ChatGPT MD settings. You can choose something like YYYYMMDDhhmmss"
        );
      },
    });
  }

  private getAiApiUrls(frontmatter: any): { [key: string]: string } {
    return {
      openai: frontmatter.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
      openrouter: frontmatter.openrouterUrl || DEFAULT_OPENROUTER_CONFIG.url,
      ollama: frontmatter.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url,
      lmstudio: frontmatter.lmstudioUrl || DEFAULT_LMSTUDIO_CONFIG.url,
      anthropic: frontmatter.anthropicUrl || DEFAULT_ANTHROPIC_CONFIG.url,
    };
  }

  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }

  /**
   * Get refactored commands for inspection
   */
  getRefactoredCommands(): ICommand[] {
    return [...this.refactoredCommands];
  }
}
