import { App, TFile } from "obsidian";
import { FileService } from "./FileService";
import { ToolExecutionContext, VaultSearchResult, FileReadResult } from "src/Models/Tool";

/**
 * Service for Obsidian vault-specific tool operations
 */
export class VaultTools {
  constructor(
    private app: App,
    private fileService: FileService
  ) {}

  /**
   * Search vault for files matching query (searches filename and content)
   */
  async searchVault(
    args: { query: string; limit?: number },
    context: ToolExecutionContext
  ): Promise<VaultSearchResult[]> {
    const { query, limit = 10 } = args;
    const lowerQuery = query.toLowerCase();
    const results: VaultSearchResult[] = [];

    // Get all markdown files
    const files = this.app.vault.getMarkdownFiles();

    // Get the current file path to exclude it from search
    const currentFile = this.app.workspace.getActiveFile();
    const currentFilePath = currentFile?.path;

    for (const file of files) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        break;
      }

      // Skip current file
      if (currentFilePath && file.path === currentFilePath) {
        continue;
      }

      // Search in filename
      if (file.basename.toLowerCase().includes(lowerQuery)) {
        const content = await this.app.vault.read(file);
        results.push({
          path: file.path,
          basename: file.basename,
          matches: 1,
          preview: content.substring(0, 200),
        });
      }
      // Search in content
      else {
        const content = await this.app.vault.read(file);
        if (content.toLowerCase().includes(lowerQuery)) {
          results.push({
            path: file.path,
            basename: file.basename,
            matches: 1,
            preview: this.extractPreview(content, query, 100),
          });
        }
      }

      // Stop if we have enough results
      if (results.length >= Math.min(limit, 50)) {
        break;
      }
    }

    console.log(`[ChatGPT MD] Vault search: "${query}" found ${results.length} results`);
    return results;
  }

  /**
   * Read contents of specified files
   */
  async readFiles(
    args: { filePaths: string[] },
    context: ToolExecutionContext
  ): Promise<FileReadResult[]> {
    const { filePaths } = args;
    const results: FileReadResult[] = [];

    for (const path of filePaths) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        break;
      }

      const file = this.app.vault.getAbstractFileByPath(path);

      if (file instanceof TFile) {
        try {
          const content = await this.app.vault.read(file);
          results.push({
            path: file.path,
            content: content,
            size: file.stat.size,
          });
        } catch (error) {
          console.error(`[ChatGPT MD] Error reading file ${path}:`, error);
          results.push({
            path: path,
            content: `Error reading file: ${error}`,
            size: 0,
          });
        }
      } else {
        results.push({
          path: path,
          content: `File not found: ${path}`,
          size: 0,
        });
      }
    }

    console.log(`[ChatGPT MD] Read ${results.length} files`);
    return results;
  }

  /**
   * Extract preview of content around query match
   */
  private extractPreview(content: string, query: string, contextChars: number = 100): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) {
      return content.substring(0, 200);
    }

    const start = Math.max(0, index - contextChars);
    const end = Math.min(content.length, index + query.length + contextChars);

    let preview = content.substring(start, end);

    if (start > 0) {
      preview = '...' + preview;
    }
    if (end < content.length) {
      preview = preview + '...';
    }

    return preview;
  }
}
