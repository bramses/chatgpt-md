import { MarkdownView } from "obsidian";
import { IView } from "../core/abstractions/IView";
import { IFile } from "../core/abstractions/IFileSystem";

export class ObsidianView implements IView {
  constructor(private view: MarkdownView) {}

  getFile(): IFile | null {
    if (!this.view.file) return null;

    return {
      path: this.view.file.path,
      basename: this.view.file.basename,
      extension: this.view.file.extension,
    };
  }

  async getContent(): Promise<string> {
    return this.view.getViewData();
  }

  async setContent(content: string): Promise<void> {
    await this.view.setViewData(content, false);
  }

  getPath(): string | null {
    return this.view.file?.path || null;
  }
}
