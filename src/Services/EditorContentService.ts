import { Editor } from "obsidian";
import { getHeaderRole, getHeadingPrefix } from "src/Utilities/TextHelpers";
import {
  HORIZONTAL_LINE_CLASS,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_IDENTIFIER,
  ROLE_USER,
  YAML_FRONTMATTER_REGEX,
} from "src/Constants";

/**
 * Service responsible for editor content manipulation
 */
export class EditorContentService {
  /**
   * Add a horizontal rule with a role header
   */
  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    const formattedContent = `${NEWLINE}<hr class="${HORIZONTAL_LINE_CLASS}">${NEWLINE}${getHeadingPrefix(headingLevel)}${ROLE_IDENTIFIER}${role}${NEWLINE}`;

    const currentPosition = editor.getCursor();

    editor.replaceRange(formattedContent, currentPosition);
    editor.setCursor(currentPosition.line + formattedContent.split("\n").length - 1, 0);
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
  }

  /**
   * Clear the chat content, preserving frontmatter
   */
  clearChat(editor: Editor): void {
    const content = editor.getValue();
    const frontmatterMatches = content.match(YAML_FRONTMATTER_REGEX);

    if (frontmatterMatches?.length) {
      const [frontmatter] = frontmatterMatches;

      // Clear editor and restore frontmatter
      editor.setValue(frontmatter);

      // Position cursor at the end of the document
      editor.setCursor({ line: editor.lastLine() + 1, ch: 0 });
    } else {
      // Clear editor
      editor.setValue("");
    }
  }

  /**
   * Move the cursor to the end of the document
   */
  moveCursorToEnd(editor: Editor): void {
    try {
      const length = editor.lastLine();

      const newCursor = {
        line: length + 1,
        ch: 0,
      };
      editor.setCursor(newCursor);
    } catch (err) {
      throw new Error("Error moving cursor to end of file" + err);
    }
  }

  /**
   * Get the heading prefix for a given heading level
   */
  getHeadingPrefix(headingLevel: number): string {
    return getHeadingPrefix(headingLevel);
  }

  /**
   * Add a comment block at the cursor position
   */
  addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
    const cursor = editor.getCursor();
    const commentBlock = `${commentStart}${NEWLINE}${commentEnd}`;

    editor.replaceRange(commentBlock, cursor);

    // Move cursor to middle of comment block
    editor.setCursor({
      line: cursor.line + 1,
      ch: cursor.ch,
    });
  }
}
