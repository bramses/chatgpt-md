import { Editor, MarkdownView, Notice, Platform } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { getHeadingPrefix } from "src/Utilities/TextHelpers";
import { isTitleTimestampFormat } from "src/Utilities/FrontmatterHelpers";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  CALL_CHATGPT_API_COMMAND_ID,
  MIN_AUTO_INFER_MESSAGES,
} from "src/Constants";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
} from "src/Services/DefaultConfigs";
import { getAiApiUrls } from "./CommandUtilities";

/**
 * Handler for the main chat command
 * Uses constructor injection for all dependencies
 */
export class ChatHandler {
  private statusBarItemEl: HTMLElement;

  constructor(
    private services: ServiceContainer,
    private stopStreamingHandler: { setCurrentAiService: (aiService: any) => void }
  ) {
    this.statusBarItemEl = services.plugin.addStatusBarItem();
  }

  static getCommand() {
    return {
      id: CALL_CHATGPT_API_COMMAND_ID,
      name: "Chat",
      icon: "message-circle",
    };
  }

  /**
   * Execute the chat command
   */
  async execute(editor: Editor, view: MarkdownView | any): Promise<void> {
    const { editorService, settingsService, apiAuthService, toolService } = this.services;
    const settings = settingsService.getSettings();
    const frontmatter = await editorService.getFrontmatter(view, settings, this.services.app);

    const aiService = this.services.aiProviderService();
    this.stopStreamingHandler.setCurrentAiService(aiService);

    try {
      // Get messages from editor
      const { messagesWithRole: messagesWithRoleAndMessage, messages } = await editorService.getMessagesFromEditor(
        editor,
        settings
      );

      // Move cursor to end of file if generateAtCursor is false
      if (!settings.generateAtCursor) {
        editorService.moveCursorToEnd(editor);
      }

      if (Platform.isMobile) {
        new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
      } else {
        this.updateStatusBar(`Calling ${frontmatter.model}`);
      }

      // Get the appropriate API key for the service
      const apiKeyToUse = apiAuthService.getApiKey(settings, frontmatter.aiService);

      // Get tool service if tools are enabled
      const toolServiceToUse = settings.enableToolCalling ? toolService : undefined;

      const response = await aiService.callAIAPI(
        messagesWithRoleAndMessage,
        frontmatter,
        getHeadingPrefix(settings.headingLevel),
        getAiApiUrls(frontmatter)[frontmatter.aiService],
        editor,
        settings.generateAtCursor,
        apiKeyToUse,
        settings,
        toolServiceToUse
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
          openrouterApiKey: apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
          // Use the centralized method for URL
          url: getAiApiUrls(frontmatter)[frontmatter.aiService],
        };

        // Ensure model is set for title inference
        if (!settingsWithApiKey.model) {
          if (frontmatter.aiService === AI_SERVICE_OPENAI) {
            settingsWithApiKey.model = DEFAULT_OPENAI_CONFIG.model;
          } else if (frontmatter.aiService === AI_SERVICE_OPENROUTER) {
            settingsWithApiKey.model = DEFAULT_OPENROUTER_CONFIG.model;
          } else if (frontmatter.aiService === AI_SERVICE_ANTHROPIC) {
            settingsWithApiKey.model = DEFAULT_ANTHROPIC_CONFIG.model;
          } else if (frontmatter.aiService === AI_SERVICE_GEMINI) {
            settingsWithApiKey.model = DEFAULT_GEMINI_CONFIG.model;
          } else if (frontmatter.aiService === AI_SERVICE_OLLAMA || frontmatter.aiService === AI_SERVICE_LMSTUDIO) {
            new Notice(
              `Auto title inference skipped: No model configured for ${frontmatter.aiService}. Please set a model in settings.`,
              6000
            );
            return;
          }
        }

        await aiService.inferTitle(view, settingsWithApiKey, messages, editorService);
      }
    } catch (err) {
      if (Platform.isMobile) {
        new Notice(`[ChatGPT MD] Calling ${frontmatter.model}. ` + err, 9000);
      }
      this.services.errorService.handleApiError(err, "ChatHandler.execute", { showNotification: true });
    }

    this.updateStatusBar("");
  }

  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string): void {
    this.statusBarItemEl.setText(text);
  }
}
