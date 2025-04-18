import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";
import { ServiceLocator } from "./ServiceLocator";
import { SettingsService } from "../Services/SettingsService";
import { IAiApiService } from "src/Services/AiService";
import { AiModelSuggestModal } from "src/Views/AiModelSuggestModel";
import { DEFAULT_OPENAI_CONFIG, fetchAvailableOpenAiModels } from "src/Services/OpenAiService";
import { DEFAULT_OLLAMA_CONFIG, fetchAvailableOllamaModels } from "src/Services/OllamaService";
import { DEFAULT_OPENROUTER_CONFIG, fetchAvailableOpenRouterModels } from "src/Services/OpenRouterService";
import {
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  COMMENT_BLOCK_END,
  COMMENT_BLOCK_START,
  MIN_AUTO_INFER_MESSAGES,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_USER,
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
    // Chat commands
    this.registerCommand("call-chatgpt-api", "Chat", "message-circle", this.handleChatCommand.bind(this));
    this.registerCommand("stop-streaming", "Stop streaming", "octagon", this.handleStopStreaming.bind(this));
    this.registerCommand("select-model-command", "Select Model", "list", this.handleSelectModel.bind(this));
    this.registerCommand("infer-title", "Infer title", "subtitles", this.handleInferTitle.bind(this));

    // Editor formatting commands
    this.registerCommand("add-hr", "Add divider", "minus", this.handleAddDivider.bind(this));
    this.registerCommand("add-comment-block", "Add comment block", "comment", this.handleAddCommentBlock.bind(this));
    this.registerCommand("clear-chat", "Clear chat (except frontmatter)", "trash", this.handleClearChat.bind(this));

    // Chat management commands
    this.registerCommand(
      "move-to-chat",
      "Create new chat with highlighted text",
      "highlighter",
      this.handleMoveToNewChat.bind(this)
    );
    this.registerCommand(
      "choose-chat-template",
      "Create new chat from template",
      "layout-template",
      this.handleChatTemplate.bind(this)
    );

    // Indexing and search commands
    this.registerCommand(
      "index-vault",
      "Index vault with Ollama embeddings",
      "search",
      this.handleIndexVault.bind(this)
    );
    this.registerCommand(
      "search-vault",
      "Search vault with Ollama embeddings",
      "search",
      this.handleSearchVault.bind(this)
    );
    this.registerCommand(
      "repair-vector-database",
      "Repair vector database (remove invalid vectors)",
      "tool",
      this.handleRepairVectorDatabase.bind(this)
    );
  }

  /**
   * Helper to register a command
   */
  private registerCommand(
    id: string,
    name: string,
    icon: string,
    callback: (editor?: Editor, view?: MarkdownView) => void
  ): void {
    this.plugin.addCommand({
      id,
      name,
      icon,
      editorCallback: (editor: Editor, view: MarkdownView) => callback(editor, view),
      callback: () => callback(),
    });
  }

  /**
   * Handle the main chat command
   */
  private async handleChatCommand(editor: Editor, view: MarkdownView): Promise<void> {
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();
    const frontmatter = editorService.getFrontmatter(view, settings, this.plugin.app);
    this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

    try {
      const { messagesWithRole: messagesWithRoleAndMessage, messages } = await editorService.getMessagesFromEditor(
        editor,
        settings
      );

      if (!settings.generateAtCursor) {
        editorService.moveCursorToEnd(editor);
      }

      this.updateStatusOrNotice(`Calling ${frontmatter.model}`);

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
        const settingsWithApiKey = this.prepareSettingsWithApiKey(frontmatter, settings);
        await this.aiService.inferTitle(view, settingsWithApiKey, messages, editorService);
      }
    } catch (err) {
      this.handleError(`Calling ${frontmatter.model}`, err);
    }

    this.updateStatusBar("");
  }

  /**
   * Handle stop streaming command
   */
  private handleStopStreaming(): void {
    if (this.aiService && "stopStreaming" in this.aiService) {
      // @ts-ignore - Call the stopStreaming method
      this.aiService.stopStreaming();
    } else {
      this.serviceLocator.getNotificationService().showWarning("No active streaming request to stop");
    }
  }

  /**
   * Handle select model command
   */
  private async handleSelectModel(editor: Editor, view: MarkdownView): Promise<void> {
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
  }

  /**
   * Handle the infer title command
   */
  private async handleInferTitle(editor: Editor, view: MarkdownView): Promise<void> {
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();
    const frontmatter = editorService.getFrontmatter(view, settings, this.plugin.app);
    this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

    if (!frontmatter.model) {
      console.log("[ChatGPT MD] Model not set in frontmatter, using default model");
      return;
    }

    this.updateStatusBar(`Calling ${frontmatter.model}`);
    const { messages } = await editorService.getMessagesFromEditor(editor, settings);
    const settingsWithApiKey = this.prepareSettingsWithApiKey(frontmatter, settings);

    await this.aiService.inferTitle(view, settingsWithApiKey, messages, editorService);
    this.updateStatusBar("");
  }

  /**
   * Handle add divider command
   */
  private handleAddDivider(editor: Editor): void {
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();
    editorService.addHorizontalRule(editor, ROLE_USER, settings.headingLevel);
  }

  /**
   * Handle add comment block command
   */
  private handleAddCommentBlock(editor: Editor): void {
    const cursor = editor.getCursor();
    const commentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;

    editor.replaceRange(commentBlock, cursor);
    editor.setCursor({ line: cursor.line + 1, ch: cursor.ch });
  }

  /**
   * Handle clear chat command
   */
  private handleClearChat(editor: Editor): void {
    const editorService = this.serviceLocator.getEditorService();
    editorService.clearChat(editor);
  }

  /**
   * Handle move to new chat command
   */
  private async handleMoveToNewChat(editor: Editor): Promise<void> {
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();

    try {
      await editorService.createNewChatWithHighlightedText(editor, settings);
    } catch (err) {
      console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
      new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
    }
  }

  /**
   * Handle choose chat template command
   */
  private async handleChatTemplate(): Promise<void> {
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();

    if (settings.dateFormat) {
      await editorService.createNewChatFromTemplate(settings, editorService.getDate(new Date(), settings.dateFormat));
      return;
    }
    new Notice("date format cannot be empty in your ChatGPT MD settings. You can choose something like YYYYMMDDhhmmss");
  }

  /**
   * Handle index vault command
   */
  private async handleIndexVault(): Promise<void> {
    try {
      this.initializeVaultServices();

      if (this.vaultIndexingService && this.vaultIndexingService.isIndexingInProgress()) {
        this.serviceLocator.getNotificationService().showWarning("Indexing is already in progress");
        return;
      }

      if (!this.vaultIndexingService) {
        this.serviceLocator.getNotificationService().showError("Failed to initialize vault indexing service");
        return;
      }

      const isOllamaAvailable = await this.vaultIndexingService.isOllamaAvailable(DEFAULT_OLLAMA_EMBEDDINGS_CONFIG);
      if (!isOllamaAvailable) {
        this.serviceLocator
          .getNotificationService()
          .showError(
            "Ollama is not available. Please make sure Ollama is running and the mxbai-embed-large model is installed."
          );
        return;
      }

      this.updateStatusOrNotice("Indexing vault with Ollama embeddings...");
      await this.vaultIndexingService.startIndexing(DEFAULT_OLLAMA_EMBEDDINGS_CONFIG, DEFAULT_INDEXING_OPTIONS);

      if (!Platform.isMobile) {
        this.updateStatusBar("");
      }
    } catch (err) {
      this.handleError("Error indexing vault", err);
    }
  }

  /**
   * Handle repair vector database command
   */
  private async handleRepairVectorDatabase(): Promise<void> {
    try {
      this.initializeVaultServices();
      const vectorDatabase = (this.vaultIndexingService as any).vectorDatabase;

      if (!vectorDatabase) {
        this.serviceLocator.getNotificationService().showError("Vector database service not available");
        return;
      }

      if (!vectorDatabase.isInitialized()) {
        const initialized = await vectorDatabase.initialize();
        if (!initialized) {
          this.serviceLocator.getNotificationService().showError("Failed to initialize vector database");
          return;
        }
      }

      this.updateStatusOrNotice("Repairing vector database...");
      const removedCount = await vectorDatabase.cleanupInvalidVectors();

      if (!Platform.isMobile) {
        this.updateStatusBar("");
      }

      this.serviceLocator
        .getNotificationService()
        .showInfo(`Vector database repair complete. Removed ${removedCount} invalid vectors.`);
    } catch (err) {
      this.handleError("Error repairing vector database", err);
    }
  }

  /**
   * Handle search vault command
   */
  private async handleSearchVault(editor: Editor, view: MarkdownView): Promise<void> {
    try {
      const selection = editor.getSelection();
      let query = selection;

      if (!query || query.trim() === "") {
        const searchPromptModal = new SearchPromptModal(this.plugin.app, async (userQuery) => {
          if (userQuery && userQuery.trim() !== "") {
            await this.performVaultSearch(userQuery, editor);
          }
        });
        searchPromptModal.open();
        return;
      }

      await this.performVaultSearch(query, editor);
    } catch (err) {
      this.handleError("Error searching vault", err);
    }
  }

  /**
   * Perform the vault search with the given query
   */
  private async performVaultSearch(query: string, editor: Editor): Promise<void> {
    try {
      this.initializeVaultServices();

      if (!this.vaultIndexingService) {
        this.serviceLocator.getNotificationService().showError("Failed to initialize vault indexing service");
        return;
      }

      this.updateStatusOrNotice(`Searching vault for: ${query.substring(0, 30)}${query.length > 30 ? "..." : ""}`);

      const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const currentFilePath = activeView?.file?.path || "";

      const results = await this.vaultIndexingService.searchVault(query, DEFAULT_OLLAMA_EMBEDDINGS_CONFIG, 10);

      if (!Platform.isMobile) {
        this.updateStatusBar("");
      }

      const filteredResults = results.filter((result) => result.path !== currentFilePath);
      if (filteredResults.length === 0) {
        this.serviceLocator.getNotificationService().showInfo("No results found in the indexed vault.");
        return;
      }

      this.insertSearchResults(query, filteredResults, editor);
    } catch (err) {
      this.handleError("Error performing vault search", err);
    }
  }

  /**
   * Insert search results into the editor
   */
  private insertSearchResults(query: string, results: any[], editor: Editor): void {
    let formattedResults = `## Search Results for: "${query}"\n\n`;

    results.forEach((result, index) => {
      const similarityPercent = Math.round(result.similarity * 100);
      formattedResults += `${index + 1}. [[${result.path}|${result.name}]] - ${similarityPercent}% similarity\n`;
    });

    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();

    if (!settings.generateAtCursor) {
      editorService.moveCursorToEnd(editor);
    }

    const cursor = editor.getCursor();
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const assistantHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT, "mxbai-embed-large");

    editor.replaceRange(assistantHeader + formattedResults, cursor);

    const userHeader = getHeaderRole(headingPrefix, ROLE_USER);
    const newCursor = {
      line: cursor.line + (assistantHeader + formattedResults).split("\n").length - 1,
      ch: 0,
    };

    editor.replaceRange(userHeader, newCursor);

    const finalCursorPos = {
      line: newCursor.line + userHeader.split("\n").length - 1,
      ch: 0,
    };
    editor.setCursor(finalCursorPos);
  }

  // ======= Helper Methods =======

  /**
   * Initialize vault services if needed
   */
  private initializeVaultServices(): void {
    if (!this.vaultIndexingService) {
      const embeddingsService = new OllamaEmbeddingsService();
      const vectorDatabase = new VectorDatabaseService(this.plugin.app);
      this.vaultIndexingService = new VaultIndexingService(this.plugin.app, vectorDatabase, embeddingsService);
    }
  }

  /**
   * Prepare settings with API key for inference
   */
  private prepareSettingsWithApiKey(frontmatter: any, settings: any): any {
    const settingsWithApiKey = {
      ...settings,
      ...frontmatter,
      openrouterApiKey: this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
      url: this.getAiApiUrls(frontmatter)[frontmatter.aiService],
    };

    if (!settingsWithApiKey.model) {
      if (frontmatter.aiService === AI_SERVICE_OPENAI) {
        settingsWithApiKey.model = "gpt-4";
      } else if (frontmatter.aiService === AI_SERVICE_OLLAMA) {
        settingsWithApiKey.model = "llama2";
      } else if (frontmatter.aiService === AI_SERVICE_OPENROUTER) {
        settingsWithApiKey.model = "anthropic/claude-3-opus:beta";
      }
    }

    return settingsWithApiKey;
  }

  /**
   * Get API URLs for different services
   */
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
      const timeout = 5000;
      const createTimeoutPromise = () => {
        return new Promise<string[]>((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out after 5 seconds")), timeout);
        });
      };

      const fetchPromises: Promise<string[]>[] = [];

      // Ollama models (no API key required)
      fetchPromises.push(
        Promise.race([fetchAvailableOllamaModels(urls[AI_SERVICE_OLLAMA]), createTimeoutPromise()]).catch((err) => {
          console.warn(`Error fetching Ollama models: ${err.message}`);
          return [] as string[];
        })
      );

      // OpenAI models (if API key exists)
      if (this.apiAuthService.isValidApiKey(apiKey)) {
        fetchPromises.push(
          Promise.race([fetchAvailableOpenAiModels(urls[AI_SERVICE_OPENAI], apiKey), createTimeoutPromise()]).catch(
            (err) => {
              console.warn(`Error fetching OpenAI models: ${err.message}`);
              return [] as string[];
            }
          )
        );
      }

      // OpenRouter models (if API key exists)
      if (this.apiAuthService.isValidApiKey(openrouterApiKey)) {
        fetchPromises.push(
          Promise.race([
            fetchAvailableOpenRouterModels(urls[AI_SERVICE_OPENROUTER], openrouterApiKey),
            createTimeoutPromise(),
          ]).catch((err) => {
            console.warn(`Error fetching OpenRouter models: ${err.message}`);
            return [] as string[];
          })
        );
      }

      const results = await Promise.all(fetchPromises);
      return results.flat();
    } catch (error) {
      new Notice("Error fetching models: " + error);
      console.error("Error fetching models:", error);
      throw error;
    }
  }

  /**
   * Update status bar or show notice based on platform
   */
  private updateStatusOrNotice(text: string): void {
    if (Platform.isMobile) {
      new Notice(`[ChatGPT MD] ${text}`);
    } else {
      this.updateStatusBar(text);
    }
  }

  /**
   * Handle error with appropriate notification
   */
  private handleError(context: string, err: any): void {
    console.error(`[ChatGPT MD] ${context}:`, err);
    this.serviceLocator.getNotificationService().showError(`${context}: ${err}`);

    if (!Platform.isMobile) {
      this.updateStatusBar("");
    }
  }

  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
