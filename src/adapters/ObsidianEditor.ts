import { Editor } from "obsidian";
import { IEditor, IEditorPosition } from "../core/abstractions/IEditor";

export class ObsidianEditor implements IEditor {
  constructor(private editor: Editor) {}

  getValue(): string {
    return this.editor.getValue();
  }

  setValue(value: string): void {
    this.editor.setValue(value);
  }

  getCursor(): IEditorPosition {
    const pos = this.editor.getCursor();
    return { line: pos.line, ch: pos.ch };
  }

  setCursor(pos: IEditorPosition): void {
    this.editor.setCursor(pos);
  }

  replaceRange(text: string, from: IEditorPosition, to?: IEditorPosition): void {
    this.editor.replaceRange(text, from, to);
  }

  getSelection(): string {
    return this.editor.getSelection();
  }

  replaceSelection(text: string): void {
    this.editor.replaceSelection(text);
  }

  getLine(line: number): string {
    return this.editor.getLine(line);
  }

  lastLine(): number {
    return this.editor.lastLine();
  }
}
