import { Editor, MarkdownView, Notice } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { MOVE_TO_CHAT_COMMAND_ID, CHOOSE_CHAT_TEMPLATE_COMMAND_ID, CLEAR_CHAT_COMMAND_ID } from "src/Constants";

/**
 * Handler for creating a new chat with highlighted text
 */
export class MoveToNewChatHandler {
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

	static getCommand() {
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
export class ChooseChatTemplateHandler {
	constructor(private services: ServiceContainer) {}

	async execute(): Promise<void> {
		const { editorService, settingsService } = this.services;
		const settings = settingsService.getSettings();

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
	}

	static getCommand() {
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
export class ClearChatHandler {
	constructor(private services: ServiceContainer) {}

	async execute(editor: Editor): Promise<void> {
		const { editorService } = this.services;
		await editorService.clearChat(editor);
	}

	static getCommand() {
		return {
			id: CLEAR_CHAT_COMMAND_ID,
			name: "Clear chat (except frontmatter)",
			icon: "trash",
		};
	}
}
