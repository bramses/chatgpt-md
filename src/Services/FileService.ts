import { App, MarkdownView, Notice, TFile } from "obsidian";
import { createFolderModal } from "src/Utilities/ModalHelpers";

/**
 * Service responsible for file and folder operations
 */
export class FileService {
  constructor(private app: App) {}

  /**
   * Write an inferred title to a file by renaming it
   */
  async writeInferredTitle(view: MarkdownView, title: string): Promise<void> {
    const file = view.file;
    if (!file) {
      throw new Error("No file is currently open");
    }

    // Sanitize the title to remove invalid characters
    const sanitizedTitle = this.sanitizeFileName(title);

    const currentFolder = file.parent?.path ?? "/";
    let newFileName = `${currentFolder}/${sanitizedTitle}.md`;

    for (let i = 1; await this.app.vault.adapter.exists(newFileName); i++) {
      newFileName = `${currentFolder}/${sanitizedTitle} (${i}).md`;
    }

    try {
      await this.app.fileManager.renameFile(file, newFileName);
    } catch (err) {
      new Notice("[ChatGPT MD] Error writing inferred title to editor");
      console.log("[ChatGPT MD] Error writing inferred title to editor", err);
      throw err;
    }
  }

  /**
   * Sanitize a file name by removing or replacing invalid characters
   * @param fileName The file name to sanitize
   * @returns The sanitized file name
   */
  sanitizeFileName(fileName: string): string {
    // Replace characters that are invalid in file names
    // These include: \ / : * ? " < > |
    return fileName.replace(/[\\/:*?"<>|]/g, "-");
  }

  /**
   * Ensure a folder exists, creating it if necessary
   */
  async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    const exists = await this.app.vault.adapter.exists(folderPath);

    if (!exists) {
      const result = await createFolderModal(this.app, folderType, folderPath);
      if (!result) {
        new Notice(
          `[ChatGPT MD] No ${folderType} found. One must be created to use the plugin. Set one in settings and make sure it exists.`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Create a new file with the given content
   */
  async createNewFile(filePath: string, content: string): Promise<TFile> {
    return this.app.vault.create(filePath, content);
  }

  /**
   * Read the contents of a file
   */
  async readFile(file: TFile): Promise<string> {
    return this.app.vault.read(file);
  }

  /**
   * Get the content of a linked note
   */
  async getLinkedNoteContent(linkPath: string): Promise<string | null> {
    try {
      const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, "");
      return file ? await this.app.vault.read(file) : null;
    } catch (error) {
      console.error(`Error reading linked note: ${linkPath}`, error);
      return null;
    }
  }

  /**
   * Format a date according to the given format
   */
  formatDate(date: Date, format: string): string {
    // Simple implementation - in a real app, you'd want a more robust date formatter
    return date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  }
}
