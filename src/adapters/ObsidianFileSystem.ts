import { Vault, TFile, TFolder } from "obsidian";
import { IFileSystem, IFile } from "../core/abstractions/IFileSystem";

export class ObsidianFileSystem implements IFileSystem {
  constructor(private vault: Vault) {}

  async readFile(path: string): Promise<string> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return await this.vault.read(file);
  }

  async writeFile(path: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.modify(file, content);
    } else {
      await this.vault.create(path, content);
    }
  }

  async exists(path: string): Promise<boolean> {
    const file = this.vault.getAbstractFileByPath(path);
    return file !== null;
  }

  async listFiles(path: string): Promise<string[]> {
    const folder = this.vault.getAbstractFileByPath(path);
    if (!folder || !(folder instanceof TFolder)) {
      throw new Error(`Folder not found: ${path}`);
    }

    return folder.children.filter((child) => child instanceof TFile).map((file) => file.path);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(oldPath);
    if (!file) {
      throw new Error(`File not found: ${oldPath}`);
    }
    await this.vault.rename(file, newPath);
  }

  async getFile(path: string): Promise<IFile | null> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      return null;
    }

    return {
      path: file.path,
      basename: file.basename,
      extension: file.extension,
    };
  }

  async createDirectory(path: string): Promise<void> {
    await this.vault.createFolder(path);
  }
}
