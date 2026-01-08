import { Editor, MarkdownView } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { ADD_HR_COMMAND_ID, ROLE_USER, COMMENT_BLOCK_START, COMMENT_BLOCK_END, NEWLINE } from "src/Constants";

/**
 * Handler for adding a horizontal rule divider
 */
export class AddDividerHandler {
	constructor(private services: ServiceContainer) {}

	async execute(editor: Editor): Promise<void> {
		const { editorService, settingsService } = this.services;
		const settings = settingsService.getSettings();
		editorService.addHorizontalRule(editor, ROLE_USER, settings.headingLevel);
	}

	static getCommand() {
		return {
			id: ADD_HR_COMMAND_ID,
			name: "Add divider",
			icon: "minus",
		};
	}
}

/**
 * Handler for adding a comment block
 */
export class AddCommentBlockHandler {
	constructor(private services: ServiceContainer) {}

	execute(editor: Editor): void {
		// Add a comment block at cursor
		const cursor = editor.getCursor();
		const line = cursor.line;
		const ch = cursor.ch;

		const commentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;
		editor.replaceRange(commentBlock, cursor);

		// Move cursor to middle of comment block
		const newCursor = {
			line: line + 1,
			ch: ch,
		};
		editor.setCursor(newCursor);
	}

	static getCommand() {
		return {
			id: "add-comment-block",
			name: "Add comment block",
			icon: "comment",
		};
	}
}
