import { App, TFile } from "obsidian";
import { FileService } from "./FileService";
import {
  FileReadResult,
  ToolExecutionContext,
  VaultSearchResult,
} from "src/Models/Tool";

/**
 * Maximum number of vault search results to return
 */
const MAX_VAULT_RESULTS = 50;

/**
 * Vault Search Service
 *
 * Handles vault-specific operations for AI tools:
 * - Search vault by filename and content
 * - Read file contents
 *
 * Features:
 * - Multi-word OR search logic
 * - Current file exclusion
 * - Configurable result limits
 * - Abort signal support
 */
export class VaultSearchService {
  constructor(
    private app: App,
    private fileService: FileService
  ) {}

  /**
   * Search vault for files matching query
   *
   * Searches both filename and content. Supports multi-word queries with OR logic:
   * - "project plan" matches files containing "project" OR "plan"
   * - Words are split by whitespace
   *
   * Excludes the current file from search results to avoid redundancy.
   *
   * @param args - Search parameters (query, limit)
   * @param context - Execution context (for abort signal)
   * @returns Array of search results with file metadata
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
      if (results.length >= Math.min(limit, MAX_VAULT_RESULTS)) {
        break;
      }
    }

    return results;
  }

  /**
   * Read contents of specified files
   *
   * Reads multiple files and returns their contents. Handles errors gracefully:
   * - File not found → Returns error message
   * - Read error → Returns error message
   * - Success → Returns file content with metadata
   *
   * @param args - File paths to read
   * @param context - Execution context (for abort signal)
   * @returns Array of file read results
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

    return results;
  }
}
