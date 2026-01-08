import { Editor } from "obsidian";
import { HORIZONTAL_LINE_CLASS, NEWLINE, ROLE_ASSISTANT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import { getHeaderRole, getHeadingPrefix } from "src/Utilities/TextHelpers";

/**
 * Utility functions for editor operations
 * These are simple, stateless functions that can be used anywhere
 */

/**
 * Add a horizontal rule with a role header
 */
export function addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
  const formattedContent = `${NEWLINE}<hr class="${HORIZONTAL_LINE_CLASS}">${NEWLINE}${getHeadingPrefix(headingLevel)}${ROLE_IDENTIFIER}${role}${NEWLINE}`;

  const currentPosition = editor.getCursor();

  editor.replaceRange(formattedContent, currentPosition);
  editor.setCursor(currentPosition.line + formattedContent.split("\n").length - 1, 0);
}

/**
 * Append a message to the editor
 */
export function appendMessage(editor: Editor, message: string, headingLevel: number): void {
  const headingPrefix = getHeadingPrefix(headingLevel);
  const assistantRoleHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT);
  const userRoleHeader = getHeaderRole(headingPrefix, ROLE_USER);

  editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
}

/**
 * Move the cursor to the end of the document
 */
export function moveCursorToEnd(editor: Editor): void {
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
 * Add a comment block at the cursor position
 */
export function addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
  const cursor = editor.getCursor();
  const commentBlock = `${commentStart}${NEWLINE}${commentEnd}`;

  editor.replaceRange(commentBlock, cursor);

  // Move cursor to middle of comment block
  editor.setCursor({
    line: cursor.line + 1,
    ch: cursor.ch,
  });
}
