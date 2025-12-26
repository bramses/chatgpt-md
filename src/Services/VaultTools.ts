import { App, TFile } from "obsidian";
import { FileService } from "./FileService";
import { FileReadResult, ToolExecutionContext, VaultSearchResult } from "src/Models/Tool";

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
   * Supports multi-word queries - matches files containing ANY of the words (OR search)
   */
  async searchVault(
    args: { query: string; limit?: number },
    context: ToolExecutionContext
  ): Promise<VaultSearchResult[]> {
    const { query, limit = 10 } = args;
    const lowerQuery = query.toLowerCase();

    // Split query into individual words for OR search
    const queryWords = lowerQuery.split(/\s+/).filter((word) => word.length > 0);

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

      const lowerBasename = file.basename.toLowerCase();

      // Check if filename matches any query word
      let filenameMatch = false;
      for (const word of queryWords) {
        if (lowerBasename.includes(word)) {
          filenameMatch = true;
          break;
        }
      }

      if (filenameMatch) {
        results.push({
          path: file.path,
          basename: file.basename,
          matches: 1,
        });
      } else {
        // Check if file content matches any query word
        const content = await this.app.vault.read(file);
        const lowerContent = content.toLowerCase();

        for (const word of queryWords) {
          if (lowerContent.includes(word)) {
            results.push({
              path: file.path,
              basename: file.basename,
              matches: 1,
            });
            break;
          }
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
  async readFiles(args: { filePaths: string[] }, context: ToolExecutionContext): Promise<FileReadResult[]> {
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
}
