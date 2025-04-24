import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";
import { ServiceLocator } from "./ServiceLocator";
import { SettingsService } from "../Services/SettingsService";
import { IAiApiService } from "src/Services/AiService";
import { AiModelSuggestModal } from "src/Views/AiModelSuggestModel";
import { DEFAULT_OPENAI_CONFIG, fetchAvailableOpenAiModels } from "src/Services/OpenAiService";
import { DEFAULT_OLLAMA_CONFIG, fetchAvailableOllamaModels } from "src/Services/OllamaService";
import { DEFAULT_OPENROUTER_CONFIG, fetchAvailableOpenRouterModels } from "src/Services/OpenRouterService";
import {
  ADD_COMMENT_BLOCK_COMMAND_ID,
  ADD_HR_COMMAND_ID,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  CALL_CHATGPT_API_COMMAND_ID,
  CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
  CLEAR_CHAT_COMMAND_ID,
  COMMENT_BLOCK_END,
  COMMENT_BLOCK_START,
  INFER_TITLE_COMMAND_ID,
  MIN_AUTO_INFER_MESSAGES,
  MOVE_TO_CHAT_COMMAND_ID,
  NEWLINE,
  ROLE_USER,
  STOP_STREAMING_COMMAND_ID,
  FETCH_MODELS_TIMEOUT_MS,
} from "src/Constants";
import { getHeadingPrefix, isTitleTimestampFormat } from "src/Utilities/TextHelpers";
import { ApiAuthService } from "src/Services/ApiAuthService";

/**
 * Registers and manages commands for the plugin
 */
export class CommandRegistry {
  private plugin: Plugin;
  private serviceLocator: ServiceLocator;
  private settingsService: SettingsService;
  private aiService: IAiApiService | null = null;
  private statusBarItemEl: HTMLElement;
  private apiAuthService: ApiAuthService;

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
    this.registerChatCommand();
    this.registerSelectModelCommand();
    this.registerAddDividerCommand();
    this.registerAddCommentBlockCommand();
    this.registerStopStreamingCommand();
    this.registerInferTitleCommand();
    this.registerMoveToNewChatCommand();
    this.registerChooseChatTemplateCommand();
    this.registerClearChatCommand();
  }

  /**
   * Register the main chat command
   */
  private registerChatCommand(): void {
    this.plugin.addCommand({
      id: CALL_CHATGPT_API_COMMAND_ID,
      name: "Chat",
      icon: "message-circle",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();
        const frontmatter = editorService.getFrontmatter(view, settings, this.plugin.app);

        this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

        try {
          // get messages from editor
          const { messagesWithRole: messagesWithRoleAndMessage, messages } = await editorService.getMessagesFromEditor(
            editor,
            settings
          );

          // move cursor to end of file if generateAtCursor is false
          if (!settings.generateAtCursor) {
            editorService.moveCursorToEnd(editor);
          }

          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
          } else {
            this.updateStatusBar(`Calling ${frontmatter.model}`);
          }

          // Get the appropriate API key for the service
          const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);

          const response = await this.aiService.callAIAPI(
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

          if (
            settings.autoInferTitle &&
            isTitleTimestampFormat(view?.file?.basename, settings.dateFormat) &&
            messagesWithRoleAndMessage.length > MIN_AUTO_INFER_MESSAGES
          ) {
            // Create a settings object with the correct API key and model
            const settingsWithApiKey = {
              ...frontmatter,
              // Use the utility function to get the correct API key
              openrouterApiKey: this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
              // Use the centralized method for URL
              url: this.getAiApiUrls(frontmatter)[frontmatter.aiService],
            };

            // Ensure model is set for title inference
            if (!settingsWithApiKey.model) {
              console.log("[ChatGPT MD] Model not set for auto title inference, using default model");
              if (frontmatter.aiService === AI_SERVICE_OPENAI) {
                settingsWithApiKey.model = "gpt-4";
              } else if (frontmatter.aiService === AI_SERVICE_OLLAMA) {
                settingsWithApiKey.model = "llama2";
              } else if (frontmatter.aiService === AI_SERVICE_OPENROUTER) {
                settingsWithApiKey.model = "anthropic/claude-3-opus:beta";
              }
            }

            console.log("[ChatGPT MD] Auto-inferring title with settings:", {
              aiService: frontmatter.aiService,
              model: settingsWithApiKey.model,
            });

            await this.aiService.inferTitle(view, settingsWithApiKey, messages, editorService);
          }
        } catch (err) {
          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}. ` + err, 9000);
          }
          console.log(err);
        }

        this.updateStatusBar("");
      },
    });
  }

  /**
   * Register the select model command
   */
  private registerSelectModelCommand(): void {
    this.plugin.addCommand({
      id: "select-model-command",
      name: "Select Model",
      icon: "list",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        const aiModelSuggestModal = new AiModelSuggestModal(this.plugin.app, editor, editorService);
        aiModelSuggestModal.open();

        const frontmatter = editorService.getFrontmatter(view, settings, this.plugin.app);
        this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

        try {
          const openAiKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
          const openRouterKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER);

          const models = await this.fetchAvailableModels(this.getAiApiUrls(frontmatter), openAiKey, openRouterKey);

          aiModelSuggestModal.close();
          new AiModelSuggestModal(this.plugin.app, editor, editorService, models).open();
        } catch (e) {
          aiModelSuggestModal.close();

          new Notice("Could not find any models");
          console.error(e);
        }
      },
    });
  }

  /**
   * Register the add divider command
   */
  private registerAddDividerCommand(): void {
    this.plugin.addCommand({
      id: ADD_HR_COMMAND_ID,
      name: "Add divider",
      icon: "minus",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();
        editorService.addHorizontalRule(editor, ROLE_USER, settings.headingLevel);
      },
    });
  }

  /**
   * Register the add comment block command
   */
  private registerAddCommentBlockCommand(): void {
    this.plugin.addCommand({
      id: ADD_COMMENT_BLOCK_COMMAND_ID,
      name: "Add comment block",
      icon: "comment",
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        // add a comment block at cursor
        const cursor = editor.getCursor();
        const line = cursor.line;
        const ch = cursor.ch;

        const commentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;
        editor.replaceRange(commentBlock, cursor);

        // move cursor to middle of comment block
        const newCursor = {
          line: line + 1,
          ch: ch,
        };
        editor.setCursor(newCursor);
      },
    });
  }

  /**
   * Register the stop streaming command
   */
  private registerStopStreamingCommand(): void {
    this.plugin.addCommand({
      id: STOP_STREAMING_COMMAND_ID,
      name: "Stop streaming",
      icon: "octagon",
      callback: () => {
        // Use the aiService's stopStreaming method if available
        if (this.aiService && "stopStreaming" in this.aiService) {
          // @ts-ignore - Call the stopStreaming method
          this.aiService.stopStreaming();
        } else {
          // No active AI service to stop streaming
          this.serviceLocator.getNotificationService().showWarning("No active streaming request to stop");
        }
      },
    });
  }

  /**
   * Register the infer title command
   */
  private registerInferTitleCommand(): void {
    this.plugin.addCommand({
      id: INFER_TITLE_COMMAND_ID,
      name: "Infer title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        // get frontmatter
        const frontmatter = editorService.getFrontmatter(view, settings, this.plugin.app);
        this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

        // Ensure model is set
        if (!frontmatter.model) {
          console.log("[ChatGPT MD] Model not set in frontmatter, using default model");
          return;
        }

        this.updateStatusBar(`Calling ${frontmatter.model}`);
        const { messages } = await editorService.getMessagesFromEditor(editor, settings);

        // Use the utility function to get the correct API key
        const settingsWithApiKey = {
          ...settings,
          ...frontmatter,
          openrouterApiKey: this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
          url: this.getAiApiUrls(frontmatter)[frontmatter.aiService],
        };

        await this.aiService.inferTitle(view, settingsWithApiKey, messages, editorService);

        this.updateStatusBar("");
      },
    });
  }

  /**
   * Register the move to new chat command
   */
  private registerMoveToNewChatCommand(): void {
    this.plugin.addCommand({
      id: MOVE_TO_CHAT_COMMAND_ID,
      name: "Create new chat with highlighted text",
      icon: "highlighter",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
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
   * Register the choose chat template command
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

  /**
   * Register the clear chat command
   */
  private registerClearChatCommand(): void {
    this.plugin.addCommand({
      id: CLEAR_CHAT_COMMAND_ID,
      name: "Clear chat (except frontmatter)",
      icon: "trash",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        editorService.clearChat(editor);
      },
    });
  }

  private getAiApiUrls(frontmatter: any): { [key: string]: string } {
    return {
      openai: frontmatter.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
      openrouter: frontmatter.openrouterUrl || DEFAULT_OPENROUTER_CONFIG.url,
      ollama: frontmatter.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url,
    };
  }

  /**
   * Fetch available models from all services
   */
  private async fetchAvailableModels(
    urls: { [key: string]: string },
    apiKey: string,
    openrouterApiKey: string
  ): Promise<string[]> {
    function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
      return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
    }

    try {
      const apiAuthService = new ApiAuthService();
      const promises: Promise<string[]>[] = [];

      // Add Ollama promise (always fetched)
      promises.push(withTimeout(fetchAvailableOllamaModels(urls[AI_SERVICE_OLLAMA]), FETCH_MODELS_TIMEOUT_MS, []));

      // Conditionally add OpenAI promise
      if (apiAuthService.isValidApiKey(apiKey)) {
        promises.push(
          withTimeout(fetchAvailableOpenAiModels(urls[AI_SERVICE_OPENAI], apiKey), FETCH_MODELS_TIMEOUT_MS, [])
        );
      }

      // Conditionally add OpenRouter promise
      if (apiAuthService.isValidApiKey(openrouterApiKey)) {
        promises.push(
          withTimeout(
            fetchAvailableOpenRouterModels(urls[AI_SERVICE_OPENROUTER], openrouterApiKey),
            FETCH_MODELS_TIMEOUT_MS,
            []
          )
        );
      }

      // Fetch all models in parallel and flatten the results
      const results = await Promise.all(promises);
      return results.flat();
    } catch (error) {
      // Handle potential errors during fetch or Promise.all
      new Notice("Error fetching models: " + (error instanceof Error ? error.message : String(error)));
      console.error("Error fetching models:", error);
      // Depending on desired behavior, you might return [] or rethrow
      return []; // Return empty array on error to avoid breaking the modal
    }
  }
  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
