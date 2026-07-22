import { Editor, MarkdownView, Notice, Platform } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { getHeadingPrefix } from "src/Utilities/TextHelpers";
import { getDefaultModelForService, isTitleTimestampFormat } from "src/Utilities/FrontmatterHelpers";
import { ChatGPT_MDSettings, MergedFrontmatterConfig } from "src/Models/Config";
import { Message } from "src/Models/Message";
import {
  AI_SERVICE_OPENROUTER,
  CALL_CHATGPT_API_COMMAND_ID,
  CALL_CHATGPT_API_SELECTION_ONLY_COMMAND_ID,
  MATH_DELIMITERS_SYSTEM_MESSAGE,
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

  static getSelectionOnlyCommand() {
    return {
      id: CALL_CHATGPT_API_SELECTION_ONLY_COMMAND_ID,
      name: "Chat (Selection Only)",
      icon: "highlighter",
    };
  }

  /**
   * Execute the chat command
   */
  async execute(editor: Editor, view: MarkdownView, options?: { selectionOnly?: boolean }): Promise<void> {
    const { editorService, settingsService, apiAuthService, toolService } = this.services;
    const settings = settingsService.getSettings();
    const frontmatter: MergedFrontmatterConfig = await editorService.getFrontmatter(view, settings, this.services.app);

    const aiService = this.services.aiProviderService();
    this.stopStreamingHandler.setCurrentAiService(aiService);

    try {
      const selectionOnly = options?.selectionOnly ?? settings.sendSelectedTextOnly;

      // Get messages from editor (full note) OR selection-only mode (user selection only)
      let messagesWithRoleAndMessage: Message[];
      let messages: string[];

      if (selectionOnly) {
        const selectedText = editor.getSelection();
        if (!selectedText || selectedText.trim().length === 0) {
          new Notice(`${PLUGIN_PREFIX} No text selected. Please select the content you want to send.`);
          return;
        }

        // If user is using selection-only prompting and also wants "generate at cursor",
        // ensure insertion happens AFTER the selected text (not replacing it).
        if (settings.generateAtCursor) {
          // Obsidian Editor supports getCursor("to") to get the end of the selection.
          const selectionEnd = (editor as unknown as { getCursor: (pos?: any) => any }).getCursor("to");
          editor.setCursor(selectionEnd);
        }

        messagesWithRoleAndMessage = [{ role: "user", content: selectedText }];
        messages = [selectedText];
      } else {
        const parsed = await editorService.getMessagesFromEditor(editor, settings);
        messagesWithRoleAndMessage = parsed.messagesWithRole;
        messages = parsed.messages;
      }

      // Prepend system messages (agent body + system_commands)
      const systemMessages = this.buildSystemMessages(frontmatter, settings);
      if (systemMessages.length > 0) {
        messagesWithRoleAndMessage.unshift(...systemMessages);
      }

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
   * Build system messages from agent body and system_commands frontmatter
   */
  private buildSystemMessages(frontmatter: MergedFrontmatterConfig, settings: ChatGPT_MDSettings): Message[] {
    const systemMessages: Message[] = [];

    // Plugin system message (user-configurable)
    if (settings.pluginSystemMessage && settings.pluginSystemMessage.trim()) {
      systemMessages.push({ role: "system", content: settings.pluginSystemMessage });
    }

    // Agent body as system message
    const agentBody = frontmatter._agentSystemMessage as string | undefined;
    if (agentBody) {
      systemMessages.push({ role: "system", content: agentBody });
    }

    // system_commands from frontmatter as system messages
    if (frontmatter.system_commands && Array.isArray(frontmatter.system_commands)) {
      for (const cmd of frontmatter.system_commands) {
        if (typeof cmd === "string" && cmd.trim()) {
          systemMessages.push({ role: "system", content: cmd });
        }
      }
    }

    // Ensure LaTeX math renders correctly in Obsidian
    systemMessages.push({ role: "system", content: MATH_DELIMITERS_SYSTEM_MESSAGE });

    return systemMessages;
  }

  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string): void {
    this.statusBarItemEl.setText(text);
  }
}
