import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";

import { StreamManager } from "src/stream";
import { ChatGPT_MDSettingsTab } from "src/Views/ChatGPT_MDSettingsTab";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { EditorService } from "src/Services/EditorService";
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
} from "src/Constants";
import { isTitleTimestampFormat } from "src/Utilities/TextHelpers";
import { IAiApiService, BaseAiService } from "src/Services/AiService";
import { AiModelSuggestModal } from "./Views/AiModelSuggestModel";
import { getApiKeyForService, isValidApiKey } from "./Utilities/SettingsUtils";
import { OpenAiService, fetchAvailableOpenAiModels } from "src/Services/OpenAiService";
import { OllamaService, fetchAvailableOllamaModels } from "src/Services/OllamaService";
import { OpenRouterService, fetchAvailableOpenRouterModels } from "src/Services/OpenRouterService";
import { ErrorService } from "./Services/ErrorService";
import { NotificationService } from "./Services/NotificationService";

// Implementation of getAiApiService to avoid circular dependencies
export const getAiApiService = (
  streamManager: StreamManager,
  serviceType: string,
  errorService?: ErrorService,
  notificationService?: NotificationService
): IAiApiService => {
  switch (serviceType) {
    case AI_SERVICE_OPENAI:
      return new OpenAiService(streamManager, errorService, notificationService);
    case AI_SERVICE_OLLAMA:
      return new OllamaService(streamManager, errorService, notificationService);
    case AI_SERVICE_OPENROUTER:
      return new OpenRouterService(streamManager, errorService, notificationService);
    default:
      throw new Error(`Unsupported API type: ${serviceType}`);
  }
};

// Implementation of fetchAvailableModels to avoid circular dependencies
export const fetchAvailableModels = async (url: string, apiKey: string, openrouterApiKey: string) => {
  try {
    // Always fetch Ollama models as they don't require an API key
    const ollamaModels = await fetchAvailableOllamaModels();

    // Only fetch OpenAI models if a valid API key exists
    let openAiModels: string[] = [];
    if (isValidApiKey(apiKey)) {
      openAiModels = await fetchAvailableOpenAiModels(url, apiKey);
    }

    // Only fetch OpenRouter models if a valid API key exists
    let openRouterModels: string[] = [];
    if (isValidApiKey(openrouterApiKey)) {
      openRouterModels = await fetchAvailableOpenRouterModels(openrouterApiKey);
    }

    return [...ollamaModels, ...openAiModels, ...openRouterModels];
  } catch (error) {
    new Notice("Error fetching models: " + error);
    console.error("Error fetching models:", error);
    throw error;
  }
};

export default class ChatGPT_MD extends Plugin {
  aiService: IAiApiService;
  editorService: EditorService;
  settings: ChatGPT_MDSettings;
  statusBarItemEl: HTMLElement;
  streamManager: StreamManager;
  notificationService: NotificationService;
  errorService: ErrorService;

  async onload() {
    this.statusBarItemEl = this.addStatusBarItem();
    this.streamManager = new StreamManager();
    this.editorService = new EditorService(this.app);
    this.settings = await Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Initialize services
    this.notificationService = new NotificationService();
    this.errorService = new ErrorService(this.notificationService);
    this.streamManager = new StreamManager(this.errorService, this.notificationService);

    this.addCommand({
      id: CALL_CHATGPT_API_COMMAND_ID,
      name: "Chat",
      icon: "message-circle",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const frontmatter = this.editorService.getFrontmatter(view, this.settings, this.app);

        this.aiService = getAiApiService(
          this.streamManager,
          frontmatter.aiService,
          this.errorService,
          this.notificationService
        );

        try {
          // get messages from editor
          const { messagesWithRole: messagesWithRoleAndMessage, messages } =
            await this.editorService.getMessagesFromEditor(editor, this.settings);

          // move cursor to end of file if generateAtCursor is false
          if (!this.settings.generateAtCursor) {
            this.editorService.moveCursorToEnd(editor);
          }

          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
          } else {
            this.updateStatusBar(`Calling ${frontmatter.model}`);
          }

          // Get the appropriate API key for the service
          const apiKeyToUse = getApiKeyForService(this.settings, frontmatter.aiService);

          const response = await this.aiService.callAIAPI(
            messagesWithRoleAndMessage,
            frontmatter,
            this.editorService.getHeadingPrefix(this.settings.headingLevel),
            editor,
            this.settings.generateAtCursor,
            apiKeyToUse
          );

          await this.editorService.processResponse(editor, response, this.settings);

          if (
            this.settings.autoInferTitle &&
            isTitleTimestampFormat(view?.file?.basename, this.settings.dateFormat) &&
            messagesWithRoleAndMessage.length > MIN_AUTO_INFER_MESSAGES
          ) {
            // Create a settings object with the correct API key
            const settingsWithApiKey = {
              ...frontmatter,
              // Use the utility function to get the correct API key
              openrouterApiKey: getApiKeyForService(this.settings, AI_SERVICE_OPENROUTER),
            };
            await this.aiService.inferTitle(view, settingsWithApiKey, messages, this.editorService);
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

    this.addCommand({
      id: "select-model-command",
      name: "Select Model",
      icon: "list",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const aiModelSuggestModal = new AiModelSuggestModal(this.app, editor, this.editorService);
        aiModelSuggestModal.open();

        const frontmatter = this.editorService.getFrontmatter(view, this.settings, this.app);

        // Step 1: Fetch available models from API
        this.aiService = getAiApiService(
          this.streamManager,
          frontmatter.aiService,
          this.errorService,
          this.notificationService
        );
        try {
          // Use the utility function to get the API keys
          const openAiKey = getApiKeyForService(this.settings, "openai");
          const openRouterKey = getApiKeyForService(this.settings, AI_SERVICE_OPENROUTER);

          const models = await fetchAvailableModels(frontmatter.url, openAiKey, openRouterKey);

          aiModelSuggestModal.close();
          new AiModelSuggestModal(this.app, editor, this.editorService, models).open();
        } catch (e) {
          aiModelSuggestModal.close();

          new Notice("Could not find any models");
          console.error(e);
        }
      },
    });

    this.addCommand({
      id: ADD_HR_COMMAND_ID,
      name: "Add divider",
      icon: "minus",
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        this.editorService.addHorizontalRule(editor, ROLE_USER, this.settings.headingLevel);
      },
    });

    this.addCommand({
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

    this.addCommand({
      id: STOP_STREAMING_COMMAND_ID,
      name: "Stop streaming",
      icon: "octagon",
      callback: () => {
        // Use the aiService's stopStreaming method if available
        if (this.aiService && "stopStreaming" in this.aiService) {
          // @ts-ignore - Call the stopStreaming method
          this.aiService.stopStreaming();
        } else {
          // Fallback to the old method
          this.streamManager.stopStreaming();
        }
      },
    });

    this.addCommand({
      id: INFER_TITLE_COMMAND_ID,
      name: "Infer title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        // get frontmatter
        const frontmatter = this.editorService.getFrontmatter(view, this.settings, this.app);
        this.aiService = getAiApiService(
          this.streamManager,
          frontmatter.aiService,
          this.errorService,
          this.notificationService
        );

        this.updateStatusBar(`Calling ${frontmatter.model}`);
        const { messages } = await this.editorService.getMessagesFromEditor(editor, this.settings);

        // Use the utility function to get the correct API key
        const settingsWithApiKey = {
          ...this.settings,
          openrouterApiKey: getApiKeyForService(this.settings, AI_SERVICE_OPENROUTER),
        };

        await this.aiService.inferTitle(view, settingsWithApiKey, messages, this.editorService);

        this.updateStatusBar("");
      },
    });

    // grab highlighted text and move to new file in default chat format
    this.addCommand({
      id: MOVE_TO_CHAT_COMMAND_ID,
      name: "Create new chat with highlighted text",
      icon: "highlighter",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        try {
          await this.editorService.createNewChatWithHighlightedText(editor, this.settings);
        } catch (err) {
          console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
          new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
        }
      },
    });

    this.addCommand({
      id: CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
      name: "Create new chat from template",
      icon: "layout-template",
      callback: async () => {
        if (this.settings.dateFormat) {
          await this.editorService.createNewChatFromTemplate(
            this.settings,
            this.editorService.getDate(new Date(), this.settings.dateFormat)
          );
        }
        new Notice(
          "date format cannot be empty in your ChatGPT MD settings. You can choose something like YYYYMMDDhhmmss"
        );
      },
    });

    this.addCommand({
      id: CLEAR_CHAT_COMMAND_ID,
      name: "Clear chat (except frontmatter)",
      icon: "trash",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        this.editorService.clearChat(editor);
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ChatGPT_MDSettingsTab(this.app, this));
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
