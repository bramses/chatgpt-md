import { App, MarkdownView, Notice, TFile } from "obsidian";
import { createFolderModal } from "src/Utilities/ModalHelpers";
import { DEFAULT_DATE_FORMAT } from "src/Constants";

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
    // Replace characters that are invalid in file names while preserving spaces and dashes
    // Allow alphanumeric characters, spaces, and dashes
    return fileName.replace(/[^\w\s-]/g, "-");
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
    // Sanitize the file path before creating the file
    const lastSlashIndex = filePath.lastIndexOf("/");
    if (lastSlashIndex !== -1) {
      const directory = filePath.substring(0, lastSlashIndex + 1);
      const filename = filePath.substring(lastSlashIndex + 1);
      const sanitizedFilename = this.sanitizeFileName(filename);
      filePath = directory + sanitizedFilename;
    } else {
      // No directory part, just a filename
      filePath = this.sanitizeFileName(filePath);
    }

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
    if (!format) {
      // If no format is provided, use the default from Constants
      format = DEFAULT_DATE_FORMAT;
    }

    // Extract date/time components with padding to ensure consistent length
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");

    // Simple replacement of format tokens with actual values
    let formattedDate = format;
    formattedDate = formattedDate.replace(/YYYY/g, year);
    formattedDate = formattedDate.replace(/MM/g, month);
    formattedDate = formattedDate.replace(/DD/g, day);
    formattedDate = formattedDate.replace(/hh/g, hours);
    formattedDate = formattedDate.replace(/mm/g, minutes);
    formattedDate = formattedDate.replace(/ss/g, seconds);

    // Replace any non-letter/non-digit characters except spaces and dashes with dashes for file safety
    formattedDate = formattedDate.replace(/[^\w\s-]/g, "-");

    return formattedDate;
  }
}
