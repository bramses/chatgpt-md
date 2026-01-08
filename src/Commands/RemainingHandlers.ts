import { Editor, Notice } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { CHOOSE_CHAT_TEMPLATE_COMMAND_ID, CLEAR_CHAT_COMMAND_ID, MOVE_TO_CHAT_COMMAND_ID } from "src/Constants";
import { CallbackCommandHandler, CommandMetadata, EditorCommandHandler } from "./CommandHandler";

/**
 * Handler for creating a new chat with highlighted text
 */
export class MoveToNewChatHandler implements EditorCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(editor: Editor): Promise<void> {
    const { editorService, settingsService } = this.services;
    const settings = settingsService.getSettings();

    try {
      await editorService.createNewChatWithHighlightedText(editor, settings);
    } catch (err) {
      console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
      new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
    }
  }

  getCommand(): CommandMetadata {
    return {
      id: MOVE_TO_CHAT_COMMAND_ID,
      name: "Create new chat with highlighted text",
      icon: "highlighter",
    };
  }
}

/**
 * Handler for creating a new chat from a template
 */
export class ChooseChatTemplateHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const { editorService, settingsService } = this.services;
    const settings = settingsService.getSettings();

    if (settings.dateFormat) {
      await editorService.createNewChatFromTemplate(settings, editorService.getDate(new Date(), settings.dateFormat));
      return;
    }
    new Notice("date format cannot be empty in your ChatGPT MD settings. You can choose something like YYYYMMDDhhmmss");
  }

  getCommand(): CommandMetadata {
    return {
      id: CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
      name: "Create new chat from template",
      icon: "layout-template",
    };
  }
}

/**
 * Handler for clearing chat (except frontmatter)
 */
export class ClearChatHandler implements EditorCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(editor: Editor): Promise<void> {
    const { editorService } = this.services;
    await editorService.clearChat(editor);
  }

  getCommand(): CommandMetadata {
    return {
      id: CLEAR_CHAT_COMMAND_ID,
      name: "Clear chat (except frontmatter)",
      icon: "trash",
    };
  }
}
