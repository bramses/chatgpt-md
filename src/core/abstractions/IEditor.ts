export interface IEditorPosition {
  line: number;
  ch: number;
}

export interface IEditorRange {
  from: IEditorPosition;
  to: IEditorPosition;
}

export interface IEditor {
  /**
   * Get the entire content of the editor
   */
  getValue(): string;

  /**
   * Set the entire content of the editor
   */
  setValue(value: string): void;

  /**
   * Get the current cursor position
   */
  getCursor(): IEditorPosition;

  /**
   * Set the cursor position
   */
  setCursor(pos: IEditorPosition): void;

  /**
   * Replace text in a range
   */
  replaceRange(text: string, from: IEditorPosition, to?: IEditorPosition): void;

  /**
   * Get the selected text
   */
  getSelection(): string;

  /**
   * Replace the current selection
   */
  replaceSelection(text: string): void;

  /**
   * Get a specific line content
   */
  getLine(line: number): string;

  /**
   * Get the last line number
   */
  lastLine(): number;
}
