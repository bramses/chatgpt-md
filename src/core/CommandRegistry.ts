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
  INDEX_VAULT_COMMAND_ID,
  INFER_TITLE_COMMAND_ID,
  MIN_AUTO_INFER_MESSAGES,
  MOVE_TO_CHAT_COMMAND_ID,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_USER,
  SEARCH_VAULT_COMMAND_ID,
  STOP_STREAMING_COMMAND_ID,
} from "src/Constants";
import { getHeaderRole, getHeadingPrefix, isTitleTimestampFormat } from "src/Utilities/TextHelpers";
import { ApiAuthService } from "src/Services/ApiAuthService";
import { DEFAULT_OLLAMA_EMBEDDINGS_CONFIG, OllamaEmbeddingsService } from "src/Services/OllamaEmbeddingsService";
import { VectorDatabaseService } from "src/Services/VectorDatabaseService";
import { DEFAULT_INDEXING_OPTIONS, VaultIndexingService } from "src/Services/VaultIndexingService";
import { SearchPromptModal } from "src/Views/SearchPromptModal";

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
  private vaultIndexingService: VaultIndexingService | null = null;

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
    this.registerIndexVaultCommand();
    this.registerSearchVaultCommand();
    this.registerRepairVectorDatabaseCommand();
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

  /**
   * Register the index vault command
   */
  private registerIndexVaultCommand(): void {
    this.plugin.addCommand({
      id: INDEX_VAULT_COMMAND_ID,
      name: "Index vault with Ollama embeddings",
      icon: "search",
      callback: async () => {
        try {
          // Initialize the services if they don't exist
          if (!this.vaultIndexingService) {
            const embeddingsService = new OllamaEmbeddingsService();
            const vectorDatabase = new VectorDatabaseService(this.plugin.app);
            this.vaultIndexingService = new VaultIndexingService(this.plugin.app, vectorDatabase, embeddingsService);
          }

          // Check if indexing is already in progress
          if (this.vaultIndexingService.isIndexingInProgress()) {
            this.serviceLocator.getNotificationService().showWarning("Indexing is already in progress");
            return;
          }

          // Check if Ollama is available
          const isOllamaAvailable = await this.vaultIndexingService.isOllamaAvailable(DEFAULT_OLLAMA_EMBEDDINGS_CONFIG);

          if (!isOllamaAvailable) {
            this.serviceLocator
              .getNotificationService()
              .showError(
                "Ollama is not available. Please make sure Ollama is running and the mxbai-embed-large model is installed."
              );
            return;
          }

          // Start indexing
          this.serviceLocator.getNotificationService().showInfo("Starting to index vault with Ollama embeddings...");

          if (Platform.isMobile) {
            new Notice("Starting to index vault with Ollama embeddings...");
          } else {
            this.updateStatusBar("Indexing vault with Ollama embeddings...");
          }

          await this.vaultIndexingService.startIndexing(DEFAULT_OLLAMA_EMBEDDINGS_CONFIG, DEFAULT_INDEXING_OPTIONS);

          if (!Platform.isMobile) {
            this.updateStatusBar("");
          }
        } catch (err) {
          console.error("[ChatGPT MD] Error indexing vault:", err);
          this.serviceLocator.getNotificationService().showError(`Error indexing vault: ${err}`);

          if (!Platform.isMobile) {
            this.updateStatusBar("");
          }
        }
      },
    });
  }

  /**
   * Register a command to repair the vector database
   */
  private registerRepairVectorDatabaseCommand(): void {
    this.plugin.addCommand({
      id: "repair-vector-database",
      name: "Repair vector database (remove invalid vectors)",
      icon: "tool",
      callback: async () => {
        try {
          // Initialize the services if they don't exist
          if (!this.vaultIndexingService) {
            const embeddingsService = new OllamaEmbeddingsService();
            const vectorDatabase = new VectorDatabaseService(this.plugin.app);
            this.vaultIndexingService = new VaultIndexingService(this.plugin.app, vectorDatabase, embeddingsService);
          }

          const vectorDatabase = (this.vaultIndexingService as any).vectorDatabase;

          if (!vectorDatabase) {
            this.serviceLocator.getNotificationService().showError("Vector database service not available");
            return;
          }

          // Initialize the database if needed
          if (!vectorDatabase.isInitialized()) {
            const initialized = await vectorDatabase.initialize();
            if (!initialized) {
              this.serviceLocator.getNotificationService().showError("Failed to initialize vector database");
              return;
            }
          }

          this.serviceLocator.getNotificationService().showInfo("Starting to repair vector database...");

          if (Platform.isMobile) {
            new Notice("Starting to repair vector database...");
          } else {
            this.updateStatusBar("Repairing vector database...");
          }

          const removedCount = await vectorDatabase.cleanupInvalidVectors();

          if (Platform.isMobile) {
            new Notice(`Vector database repair complete. Removed ${removedCount} invalid vectors.`);
          } else {
            this.updateStatusBar("");
          }

          this.serviceLocator
            .getNotificationService()
            .showInfo(`Vector database repair complete. Removed ${removedCount} invalid vectors.`);
        } catch (err) {
          console.error("[ChatGPT MD] Error repairing vector database:", err);
          this.serviceLocator.getNotificationService().showError(`Error repairing vector database: ${err}`);

          if (!Platform.isMobile) {
            this.updateStatusBar("");
          }
        }
      },
    });
  }

  /**
   * Register the search vault command
   */
  private registerSearchVaultCommand(): void {
    this.plugin.addCommand({
      id: SEARCH_VAULT_COMMAND_ID,
      name: "Search vault with Ollama embeddings",
      icon: "search",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        try {
          // Get the selected text or prompt the user for a query
          const selection = editor.getSelection();
          let query = selection;

          if (!query || query.trim() === "") {
            // If no selection, show the search prompt modal
            const searchPromptModal = new SearchPromptModal(this.plugin.app, async (userQuery) => {
              if (userQuery && userQuery.trim() !== "") {
                await this.performVaultSearch(userQuery, editor);
              }
            });
            searchPromptModal.open();
            return;
          }

          // If we have a selection, perform the search directly
          await this.performVaultSearch(query, editor);
        } catch (err) {
          console.error("[ChatGPT MD] Error searching vault:", err);
          this.serviceLocator.getNotificationService().showError(`Error searching vault: ${err}`);

          if (!Platform.isMobile) {
            this.updateStatusBar("");
          }
        }
      },
    });
  }

  /**
   * Perform the vault search with the given query
   * @param query - The search query
   * @param editor - The editor instance
   */
  private async performVaultSearch(query: string, editor: Editor): Promise<void> {
    try {
      // Initialize the services if they don't exist
      if (!this.vaultIndexingService) {
        const embeddingsService = new OllamaEmbeddingsService();
        const vectorDatabase = new VectorDatabaseService(this.plugin.app);
        this.vaultIndexingService = new VaultIndexingService(this.plugin.app, vectorDatabase, embeddingsService);
      }

      // Show status
      if (Platform.isMobile) {
        new Notice(`Searching vault for: ${query.substring(0, 30)}${query.length > 30 ? "..." : ""}`);
      } else {
        this.updateStatusBar(`Searching vault for: ${query.substring(0, 30)}${query.length > 30 ? "..." : ""}`);
      }

      // Get the current file path to exclude from results
      const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const currentFilePath = activeView?.file?.path || "";

      // Search the vault
      const results = await this.vaultIndexingService.searchVault(
        query,
        DEFAULT_OLLAMA_EMBEDDINGS_CONFIG,
        5 // Limit to 5 results
      );

      if (!Platform.isMobile) {
        this.updateStatusBar("");
      }

      // Filter out the current file from results
      const filteredResults = results.filter((result) => result.path !== currentFilePath);

      if (filteredResults.length === 0) {
        this.serviceLocator.getNotificationService().showInfo("No results found in the indexed vault.");
        return;
      }

      // Format the results
      let formattedResults = `## Search Results for: "${query}"\n\n`;

      filteredResults.forEach((result, index) => {
        const similarityPercent = Math.round(result.similarity * 100);
        // Use wiki links (double brackets) instead of markdown links
        formattedResults += `${index + 1}. [[${result.path}|${result.name}]] - ${similarityPercent}% similarity\n`;
      });

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.settingsService.getSettings();

      // Move cursor to end of file if not generating at cursor
      if (!settings.generateAtCursor) {
        editorService.moveCursorToEnd(editor);
      }

      // Get cursor position for insertion
      const cursor = editor.getCursor();

      // Add an assistant header with the model name
      const headingPrefix = getHeadingPrefix(settings.headingLevel);
      const assistantHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT, "mxbai-embed-large");

      // Insert both the assistant header and the search results
      editor.replaceRange(assistantHeader + formattedResults, cursor);

      // Add a user divider after the search results
      const userHeader = getHeaderRole(headingPrefix, ROLE_USER);

      // Get cursor position after adding the assistant response
      const newCursor = {
        line: cursor.line + (assistantHeader + formattedResults).split("\n").length - 1,
        ch: 0,
      };

      // Insert the user divider
      editor.replaceRange(userHeader, newCursor);

      // Move cursor to after the user divider (for the user to start typing their response)
      const finalCursorPos = {
        line: newCursor.line + userHeader.split("\n").length - 1,
        ch: 0,
      };
      editor.setCursor(finalCursorPos);
    } catch (err) {
      console.error("[ChatGPT MD] Error performing vault search:", err);
      this.serviceLocator.getNotificationService().showError(`Error performing vault search: ${err}`);

      if (!Platform.isMobile) {
        this.updateStatusBar("");
      }
    }
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
    try {
      const apiAuthService = new ApiAuthService();
      const timeout = 5000; // 5 seconds timeout

      // Create a timeout promise
      const createTimeoutPromise = () => {
        return new Promise<string[]>((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out after 5 seconds")), timeout);
        });
      };

      // Prepare fetch promises
      const fetchPromises: Promise<string[]>[] = [];

      // Always fetch Ollama models as they don't require an API key
      const ollamaPromise = Promise.race([
        fetchAvailableOllamaModels(urls[AI_SERVICE_OLLAMA]),
        createTimeoutPromise(),
      ]).catch((err) => {
        console.warn(`Error fetching Ollama models: ${err.message}`);
        return [] as string[];
      });
      fetchPromises.push(ollamaPromise);

      // Only fetch OpenAI models if a valid API key exists
      if (apiAuthService.isValidApiKey(apiKey)) {
        const openAiPromise = Promise.race([
          fetchAvailableOpenAiModels(urls[AI_SERVICE_OPENAI], apiKey),
          createTimeoutPromise(),
        ]).catch((err) => {
          console.warn(`Error fetching OpenAI models: ${err.message}`);
          return [] as string[];
        });
        fetchPromises.push(openAiPromise);
      }

      // Only fetch OpenRouter models if a valid API key exists
      if (apiAuthService.isValidApiKey(openrouterApiKey)) {
        const openRouterPromise = Promise.race([
          fetchAvailableOpenRouterModels(urls[AI_SERVICE_OPENROUTER], openrouterApiKey),
          createTimeoutPromise(),
        ]).catch((err) => {
          console.warn(`Error fetching OpenRouter models: ${err.message}`);
          return [] as string[];
        });
        fetchPromises.push(openRouterPromise);
      }

      // Execute all promises in parallel and combine results
      const results = await Promise.all(fetchPromises);
      return results.flat();
    } catch (error) {
      new Notice("Error fetching models: " + error);
      console.error("Error fetching models:", error);
      throw error;
    }
  }
  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
