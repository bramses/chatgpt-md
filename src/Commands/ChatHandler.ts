import { Editor, MarkdownView, Notice, Platform } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { getHeadingPrefix } from "src/Utilities/TextHelpers";
import { getDefaultModelForService, isTitleTimestampFormat } from "src/Utilities/FrontmatterHelpers";
import { ChatGPT_MDSettings, MergedFrontmatterConfig } from "src/Models/Config";
import {
  AI_SERVICE_OPENROUTER,
  CALL_CHATGPT_API_COMMAND_ID,
  MIN_AUTO_INFER_MESSAGES,
  NOTICE_DURATION_LONG_MS,
  NOTICE_DURATION_SHORT_MS,
  PLUGIN_PREFIX,
} from "src/Constants";
// DEFAULT_*_CONFIG imports removed - using getDefaultModelForService instead
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
  async execute(editor: Editor, view: MarkdownView): Promise<void> {
    const { editorService, settingsService, apiAuthService, toolService } = this.services;
    const settings = settingsService.getSettings();
    const frontmatter: MergedFrontmatterConfig = await editorService.getFrontmatter(view, settings, this.services.app);

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
        new Notice(`${PLUGIN_PREFIX} Calling ${frontmatter.model}`);
      } else {
        this.updateStatusBar(`Calling ${frontmatter.model}`);
      }

      // Get the appropriate API key for the service
      const apiKeyToUse = apiAuthService.getApiKey(settings, frontmatter.aiService);

      // Get tool service if tools are enabled
      const toolServiceToUse = settings.enableToolCalling ? toolService : undefined;

      const response = await aiService.callAiAPI(
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
        const settingsWithApiKey: ChatGPT_MDSettings & { url?: string; model?: string } = {
          ...settings,
          ...frontmatter,
          // Use the utility function to get the correct API key
          openrouterApiKey: apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
          // Use the centralized method for URL
          url: getAiApiUrls(frontmatter)[frontmatter.aiService],
        };

        // Ensure model is set for title inference
        if (!settingsWithApiKey.model) {
          settingsWithApiKey.model = getDefaultModelForService(frontmatter.aiService);
          if (!settingsWithApiKey.model) {
            new Notice(
              `Auto title inference skipped: No model configured for ${frontmatter.aiService}. Please set a model in settings.`,
              NOTICE_DURATION_SHORT_MS
            );
            return;
          }
        }

        await aiService.inferTitle(view, settingsWithApiKey as ChatGPT_MDSettings, messages, editorService);
      }
    } catch (err) {
      if (Platform.isMobile) {
        new Notice(`${PLUGIN_PREFIX} Calling ${frontmatter.model}. ` + err, NOTICE_DURATION_LONG_MS);
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
