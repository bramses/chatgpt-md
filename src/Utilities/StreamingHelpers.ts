import { Editor, EditorPosition } from "obsidian";

/**
 * Default interval for flushing buffered text to editor (ms)
 */
export const DEFAULT_FLUSH_INTERVAL_MS = 50;

/**
 * Flush buffered text to the editor at the specified cursor position
 * Handles both cursor-based and selection-based insertion
 */
export function flushBufferedText(
  editor: Editor,
  bufferedText: string,
  currentCursor: EditorPosition,
  setAtCursor: boolean
): EditorPosition {
  if (bufferedText.length === 0) {
    return currentCursor;
  }

  if (setAtCursor) {
    editor.replaceSelection(bufferedText);
  } else {
    editor.replaceRange(bufferedText, currentCursor);
    const currentOffset = editor.posToOffset(currentCursor);
    const newOffset = currentOffset + bufferedText.length;
    const newCursor = editor.offsetToPos(newOffset);
    // Update visible cursor position for real-time feedback
    editor.setCursor(newCursor);
    return newCursor;
  }

  return currentCursor;
}

/**
 * Calculate new cursor position after inserting text at a specific position
 */
export function calculateCursorAfterInsert(
  editor: Editor,
  text: string,
  insertPosition: EditorPosition
): EditorPosition {
  const offset = editor.posToOffset(insertPosition);
  const newOffset = offset + text.length;
  return editor.offsetToPos(newOffset);
}
