import { IEditor, IEditorPosition } from "../../src/core/abstractions/IEditor";

export class MockEditor implements IEditor {
  private content: string;
  private cursor: IEditorPosition = { line: 0, ch: 0 };
  private selection = "";

  constructor(initialContent = "") {
    this.content = initialContent;
  }

  getValue(): string {
    return this.content;
  }

  setValue(value: string): void {
    this.content = value;
  }

  getCursor(): IEditorPosition {
    return { ...this.cursor };
  }

  setCursor(pos: IEditorPosition): void {
    this.cursor = { ...pos };
  }

  replaceRange(text: string, from: IEditorPosition, to?: IEditorPosition): void {
    const lines = this.content.split("\n");

    if (!to) {
      // Insert at position
      const line = lines[from.line] || "";
      lines[from.line] = line.slice(0, from.ch) + text + line.slice(from.ch);
    } else {
      // Replace range
      const startLine = lines[from.line] || "";
      const endLine = lines[to.line] || "";

      const before = startLine.slice(0, from.ch);
      const after = endLine.slice(to.ch);

      // Remove lines between start and end
      lines.splice(from.line, to.line - from.line + 1, before + text + after);
    }

    this.content = lines.join("\n");
  }

  getSelection(): string {
    return this.selection;
  }

  replaceSelection(text: string): void {
    if (this.selection) {
      this.content = this.content.replace(this.selection, text);
      this.selection = "";
    } else {
      // Insert at cursor
      this.replaceRange(text, this.cursor);
    }
  }

  getLine(line: number): string {
    return this.content.split("\n")[line] || "";
  }

  lastLine(): number {
    return this.content.split("\n").length - 1;
  }

  // Test helper methods
  setSelection(text: string): void {
    this.selection = text;
  }
}
