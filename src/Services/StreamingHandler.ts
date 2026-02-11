import { Editor, EditorPosition } from "obsidian";
import {
  calculateCursorAfterInsert,
  DEFAULT_FLUSH_INTERVAL_MS,
  flushBufferedText,
} from "src/Utilities/StreamingHelpers";

/**
 * StreamingHandler manages text streaming with buffering and cursor positioning
 * Handles both direct cursor positioning and insertion at current selection
 * Now uses utility functions for common operations
 */
export class StreamingHandler {
  private static readonly MAX_BUFFER_SIZE = 10000;

  private editor: Editor;
  private currentCursor: EditorPosition;
  private flushTimer: NodeJS.Timeout | null = null;
  private bufferedText = "";
  private flushInterval: number;
  private setAtCursor: boolean;

  constructor(
    editor: Editor,
    initialCursor: EditorPosition,
    setAtCursor: boolean = false,
    flushInterval: number = DEFAULT_FLUSH_INTERVAL_MS
  ) {
    this.editor = editor;
    this.currentCursor = initialCursor;
    this.setAtCursor = setAtCursor;
    this.flushInterval = flushInterval;
  }

  /**
   * Start the buffering mechanism with periodic flushes
   */
  public startBuffering(): void {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
    }
  }

  /**
   * Append text to the buffer
   */
  public appendText(text: string): void {
    this.bufferedText += text;
  }

  /**
   * Flush buffered text to the editor up to the last complete line.
   * Retains any trailing partial line to avoid mid-line insertions
   * that can cause cursor offset miscalculations during markdown re-rendering.
   */
  public flush(): void {
    if (this.bufferedText.length === 0) return;

    if (this.bufferedText.length > StreamingHandler.MAX_BUFFER_SIZE) {
      this.forceFlush();
      return;
    }

    const lastNewline = this.bufferedText.lastIndexOf("\n");
    if (lastNewline === -1) {
      // No complete line yet — wait for more text
      return;
    }

    const toFlush = this.bufferedText.substring(0, lastNewline + 1);
    this.bufferedText = this.bufferedText.substring(lastNewline + 1);

    this.currentCursor = flushBufferedText(this.editor, toFlush, this.currentCursor, this.setAtCursor);
  }

  /**
   * Stop buffering and flush all remaining text (including partial lines)
   */
  public stopBuffering(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.forceFlush();
  }

  /**
   * Force flush all buffered text regardless of line boundaries.
   * Used when streaming ends to ensure no text is left in the buffer.
   */
  private forceFlush(): void {
    if (this.bufferedText.length === 0) return;

    this.currentCursor = flushBufferedText(this.editor, this.bufferedText, this.currentCursor, this.setAtCursor);
    this.bufferedText = "";
  }

  /**
   * Get the current cursor position
   */
  public getCursor(): EditorPosition {
    return this.currentCursor;
  }

  /**
   * Set the cursor position
   */
  public setCursor(cursor: EditorPosition): void {
    this.currentCursor = cursor;
  }

  /**
   * Update cursor position after inserting text at a specific position
   * Delegates to utility function
   */
  public updateCursorAfterInsert(text: string, insertPosition: EditorPosition): void {
    this.currentCursor = calculateCursorAfterInsert(this.editor, text, insertPosition);
  }

  /**
   * Get the buffered text (for debugging)
   */
  public getBufferedText(): string {
    return this.bufferedText;
  }

  /**
   * Reset the buffer and cursor
   */
  public reset(cursor: EditorPosition): void {
    this.bufferedText = "";
    this.currentCursor = cursor;
  }
}
