import { App, TFile } from "obsidian";
import { FileService } from "./FileService";
import { FileReadResult, ToolExecutionContext, VaultSearchResult } from "src/Models/Tool";
import { isSuppressedLifecycle } from "src/Models/Knowledge/Epistemics";
import { Logger } from "src/Utilities/Logger";

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
    const queryWords = this.getQueryWords(query);
    const results: VaultSearchResult[] = [];
    const files = this.app.vault.getMarkdownFiles();
    const currentFilePath = this.app.workspace.getActiveFile()?.path;

    for (const file of files) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        break;
      }

      // Skip current file
      if (currentFilePath && file.path === currentFilePath) {
        continue;
      }

      // Skip notes the user retired. Forgetting is allowed: a retired reading
      // keeps its history on disk but stops being surfaced to the model.
      if (this.isRetired(file)) {
        continue;
      }

      if (this.matchesFileName(file, queryWords)) {
        results.push({
          path: file.path,
          basename: file.basename,
          matches: 1,
        });
      } else {
        const contentMatches = await this.matchesFileContent(file, queryWords);
        if (contentMatches) {
          results.push({
            path: file.path,
            basename: file.basename,
            matches: 1,
          });
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
   * A note is out of retrieval when its lifecycle says so. This is how the
   * vault lets old models about a person stop shaping new answers, without
   * deleting the evidence that produced them.
   */
  private isRetired(file: TFile): boolean {
    try {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as
        { status?: unknown; surface_in_retrieval?: unknown } | undefined;
      if (!frontmatter) return false;
      if (frontmatter.surface_in_retrieval === false) return true;
      return isSuppressedLifecycle(typeof frontmatter.status === "string" ? frontmatter.status : undefined);
    } catch {
      return false;
    }
  }

  private getQueryWords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 0);
  }

  private matchesFileName(file: TFile, queryWords: string[]): boolean {
    const lowerBasename = file.basename.toLowerCase();
    return queryWords.some((word) => lowerBasename.includes(word));
  }

  private async matchesFileContent(file: TFile, queryWords: string[]): Promise<boolean> {
    const lowerContent = (await this.app.vault.read(file)).toLowerCase();
    return queryWords.some((word) => lowerContent.includes(word));
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
          Logger.error(`[ChatGPT MD] Error reading file ${path}`, { error });
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
