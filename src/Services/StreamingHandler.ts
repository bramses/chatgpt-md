import { App, Editor, EditorPosition, TFile } from "obsidian";
import {
  calculateCursorAfterInsert,
  DEFAULT_FLUSH_INTERVAL_MS,
  flushBufferedText,
} from "src/Utilities/StreamingHelpers";
import { getFileForEditor } from "src/Utilities/EditorHelpers";

/**
 * StreamingHandler manages text streaming with buffering and cursor positioning
 * Handles both direct cursor positioning and insertion at current selection
 * Now uses utility functions for common operations
 *
 * Note-switch safety: Obsidian reuses one Editor instance per leaf and swaps
 * the document when the user navigates to another note in the same tab. If
 * `app` and `targetFile` are supplied, the handler verifies the editor still
 * displays the originating file before each write. Once the editor has
 * navigated away, all remaining output is redirected to the original file via
 * the vault API so streamed text never lands in the wrong note.
 */
export class StreamingHandler {
  private static readonly MAX_BUFFER_SIZE = 10000;

  private editor: Editor;
  private currentCursor: EditorPosition;
  private flushTimer: NodeJS.Timeout | null = null;
  private bufferedText = "";
  private flushInterval: number;
  private setAtCursor: boolean;

  private app?: App;
  private targetFile?: TFile | null;
  private redirected = false;
  private fileWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    editor: Editor,
    initialCursor: EditorPosition,
    setAtCursor: boolean = false,
    flushInterval: number = DEFAULT_FLUSH_INTERVAL_MS,
    app?: App,
    targetFile?: TFile | null
  ) {
    this.editor = editor;
    this.currentCursor = initialCursor;
    this.setAtCursor = setAtCursor;
    this.flushInterval = flushInterval;
    this.app = app;
    this.targetFile = targetFile;
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

    this.writeChunk(toFlush);
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

    this.writeChunk(this.bufferedText);
    this.bufferedText = "";
  }

  /**
   * Write a chunk of text to its destination.
   *
   * Writes to the live editor while it still displays the originating file.
   * Once the editor has navigated to a different note, output is permanently
   * redirected to the original file via the vault API (sticky redirect) so a
   * mid-stream note switch can never split output across two notes.
   */
  private writeChunk(text: string): void {
    if (text.length === 0) return;

    if (this.shouldRedirectToFile()) {
      this.appendToTargetFile(text);
      return;
    }

    this.currentCursor = flushBufferedText(this.editor, text, this.currentCursor, this.setAtCursor);
  }

  /**
   * Determine whether writes must be redirected to the original file because
   * the editor is no longer displaying it. Sticky: stays true once tripped.
   */
  private shouldRedirectToFile(): boolean {
    if (this.redirected) return true;
    if (!this.app || !this.targetFile) return false;

    const currentFile = getFileForEditor(this.app, this.editor);
    if (currentFile?.path !== this.targetFile.path) {
      this.redirected = true;
      return true;
    }
    return false;
  }

  /**
   * Append text to the original file via the vault API, preserving order
   * across concurrent flushes with a serialized promise queue.
   */
  private appendToTargetFile(text: string): void {
    const app = this.app;
    const file = this.targetFile;
    if (!app || !file) return;

    this.fileWriteQueue = this.fileWriteQueue
      .then(() => app.vault.process(file, (data) => data + text))
      .then(() => undefined)
      .catch((err) => {
        console.error("[ChatGPT MD] Failed to write streamed response to original file:", err);
      });
  }

  /**
   * Whether it is still safe to write directly to the editor (i.e. it has not
   * navigated to a different note). Used by callers for cursor/header writes.
   */
  public canWriteToEditor(): boolean {
    return !this.shouldRedirectToFile();
  }

  /**
   * Whether output has been redirected to the original file at any point.
   */
  public isRedirected(): boolean {
    return this.redirected;
  }

  /**
   * Write text immediately (used for error messages), routing to the editor or
   * the original file depending on where the editor currently points.
   */
  public writeImmediate(text: string): void {
    this.writeChunk(text);
  }

  /**
   * Await any pending redirected file writes so callers can safely run
   * follow-up operations (e.g. appending a user delimiter) after streaming.
   */
  public async flushPendingFileWrites(): Promise<void> {
    await this.fileWriteQueue;
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
