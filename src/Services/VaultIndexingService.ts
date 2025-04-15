import { App, Notice, TFile, TFolder, Vault } from "obsidian";
import { OllamaEmbeddingsConfig, OllamaEmbeddingsService } from "./OllamaEmbeddingsService";
import { VectorDatabaseService } from "./VectorDatabaseService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

/**
 * Options for the vault indexing process
 */
export interface VaultIndexingOptions {
  includeFolders?: string[]; // List of folders to include
  excludeFolders?: string[]; // List of folders to exclude
  includeExtensions?: string[]; // List of extensions to include
  excludeExtensions?: string[]; // List of extensions to exclude
  maxFileSize?: number; // Maximum file size in bytes
  batchSize?: number; // Files to process in each batch
  chunkSize?: number; // Size of text chunks for large files
  showProgress?: boolean; // Whether to show progress notifications
}

/**
 * Search result interface
 */
export interface SearchResult {
  path: string;
  name: string;
  similarity: number;
}

/**
 * Default options for the vault indexing process
 */
export const DEFAULT_INDEXING_OPTIONS: VaultIndexingOptions = {
  includeFolders: [],
  excludeFolders: [".git", ".obsidian", "node_modules"],
  includeExtensions: [".md", ".txt", ".markdown", ".mdx"],
  excludeExtensions: [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".mp3", ".mp4", ".pdf"],
  maxFileSize: 1024 * 1024, // 1MB
  batchSize: 10, // Process 10 files at a time
  chunkSize: 10000, // 10k characters per chunk
  showProgress: true, // Show progress notifications
};

/**
 * Service for indexing vault contents into the vector database
 */
export class VaultIndexingService {
  private app: App;
  private vault: Vault;
  private embeddingsService: OllamaEmbeddingsService;
  private vectorDatabase: VectorDatabaseService;
  private errorService: ErrorService;
  private notificationService: NotificationService;
  private indexingInProgress = false;
  private indexingCancelled = false;
  private totalFiles = 0;
  private processedFiles = 0;
  private progressNoticeId: string | null = null;

  constructor(
    app: App,
    vectorDatabase: VectorDatabaseService,
    embeddingsService?: OllamaEmbeddingsService,
    errorService?: ErrorService,
    notificationService?: NotificationService
  ) {
    this.app = app;
    this.vault = app.vault;
    this.vectorDatabase = vectorDatabase;
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.embeddingsService =
      embeddingsService || new OllamaEmbeddingsService(this.errorService, this.notificationService);
  }

  /**
   * Check if the Ollama embeddings model is available
   */
  async isOllamaAvailable(config: OllamaEmbeddingsConfig): Promise<boolean> {
    return await this.embeddingsService.isOllamaAvailable(config);
  }

  /**
   * Start indexing the vault
   * @param config - The Ollama embeddings configuration
   * @param options - Indexing options
   * @returns Promise that resolves when indexing is complete
   */
  async startIndexing(
    config: OllamaEmbeddingsConfig,
    options: VaultIndexingOptions = DEFAULT_INDEXING_OPTIONS
  ): Promise<void> {
    if (this.indexingInProgress) {
      this.notificationService.showWarning("Indexing is already in progress");
      return;
    }

    this.indexingInProgress = true;
    this.indexingCancelled = false;
    this.processedFiles = 0;

    try {
      console.log(`[ChatGPT MD] Starting vault indexing with config:`, {
        model: config.model,
        url: config.url,
        dimensions: config.dimensions,
        options: {
          includeFolders: options.includeFolders,
          excludeFolders: options.excludeFolders,
          batchSize: options.batchSize,
          maxFileSize: options.maxFileSize,
          chunkSize: options.chunkSize,
        },
      });

      // Initialize vector database if needed
      if (!this.vectorDatabase.isInitialized()) {
        console.log(`[ChatGPT MD] Initializing vector database...`);
        const initialized = await this.vectorDatabase.initialize();
        if (!initialized) {
          throw new Error("Failed to initialize vector database");
        }
        console.log(`[ChatGPT MD] Vector database initialized successfully`);
      }

      // Clear the existing database
      console.log(`[ChatGPT MD] Clearing existing database before indexing...`);
      const clearResult = await this.vectorDatabase.clearDatabase();
      console.log(
        `[ChatGPT MD] Database cleared: ${clearResult.deletedFiles} files and ${clearResult.deletedVectors} vectors removed`
      );
      this.notificationService.showInfo(`Cleared previous index (${clearResult.deletedFiles} files)`);

      // Check if Ollama is available
      console.log(`[ChatGPT MD] Checking if Ollama is available at ${config.url}...`);
      const ollamaAvailable = await this.isOllamaAvailable(config);
      if (!ollamaAvailable) {
        throw new Error("Ollama embeddings service is not available. Please check your Ollama installation.");
      }
      console.log(`[ChatGPT MD] Ollama is available and ready`);

      // Get files to index
      console.log(`[ChatGPT MD] Collecting files to index...`);
      const files = await this.getFilesToIndex(options);
      this.totalFiles = files.length;

      if (this.totalFiles === 0) {
        this.notificationService.showInfo("No files found to index");
        this.indexingInProgress = false;
        return;
      }

      console.log(`[ChatGPT MD] Found ${this.totalFiles} files to index`);

      // Show initial progress
      if (options.showProgress) {
        this.showProgressNotice(0, this.totalFiles);
      }

      // Process files in batches
      const batchSize = options.batchSize || DEFAULT_INDEXING_OPTIONS.batchSize || 10;
      for (let i = 0; i < this.totalFiles; i += batchSize) {
        if (this.indexingCancelled) {
          break;
        }

        const batch = files.slice(i, i + batchSize);
        console.log(
          `[ChatGPT MD] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(this.totalFiles / batchSize)} (${batch.length} files)`
        );
        await this.processBatch(batch, config, options);

        // Update progress
        if (options.showProgress) {
          this.showProgressNotice(this.processedFiles, this.totalFiles);
        }

        console.log(
          `[ChatGPT MD] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(this.totalFiles / batchSize)}, processed ${this.processedFiles}/${this.totalFiles} files`
        );
      }

      // Finalize
      if (this.indexingCancelled) {
        console.log(
          `[ChatGPT MD] Indexing was cancelled after processing ${this.processedFiles}/${this.totalFiles} files`
        );
        this.notificationService.showInfo("Indexing cancelled");
      } else {
        const stats = await this.vectorDatabase.getStats();
        console.log(`[ChatGPT MD] Indexing complete. Stats:`, stats);
        this.notificationService.showInfo(`Indexing complete. ${stats.fileCount} files indexed.`);
      }
    } catch (err) {
      console.error("[ChatGPT MD] Error during indexing:", err);
      this.notificationService.showError(`Error during indexing: ${err}`);
    } finally {
      this.indexingInProgress = false;
      this.clearProgressNotice();
    }
  }

  /**
   * Search the indexed vault for similar content
   * @param query - The search query
   * @param config - The Ollama embeddings configuration
   * @param limit - The maximum number of results to return
   * @returns Promise with search results
   */
  async searchVault(query: string, config: OllamaEmbeddingsConfig, limit: number = 5): Promise<SearchResult[]> {
    try {
      // Initialize vector database if needed
      if (!this.vectorDatabase.isInitialized()) {
        const initialized = await this.vectorDatabase.initialize();
        if (!initialized) {
          throw new Error("Failed to initialize vector database");
        }
      }

      // Check if Ollama is available
      const ollamaAvailable = await this.isOllamaAvailable(config);
      if (!ollamaAvailable) {
        throw new Error("Ollama embeddings service is not available. Please check your Ollama installation.");
      }

      // Get the vector database stats
      const stats = await this.vectorDatabase.getStats();
      if (stats.fileCount === 0) {
        throw new Error("No files have been indexed. Please run the index command first.");
      }

      // Search the vector database
      return await this.vectorDatabase.search(query, config, limit);
    } catch (err) {
      console.error("[ChatGPT MD] Error during search:", err);
      this.notificationService.showError(`Error during search: ${err}`);
      return [];
    }
  }

  /**
   * Cancel the current indexing process
   */
  cancelIndexing(): void {
    if (this.indexingInProgress) {
      this.indexingCancelled = true;
      this.notificationService.showInfo("Cancelling indexing...");
    }
  }

  /**
   * Check if indexing is currently in progress
   */
  isIndexingInProgress(): boolean {
    return this.indexingInProgress;
  }

  /**
   * Process a batch of files
   * @param files - Array of files to process
   * @param config - The Ollama embeddings configuration
   * @param options - Indexing options
   */
  private async processBatch(
    files: TFile[],
    config: OllamaEmbeddingsConfig,
    options: VaultIndexingOptions
  ): Promise<void> {
    const promises = files.map((file) => this.processFile(file, config, options));
    await Promise.all(promises);
  }

  /**
   * Process a single file
   * @param file - The file to process
   * @param config - The Ollama embeddings configuration
   * @param options - Indexing options
   */
  private async processFile(file: TFile, config: OllamaEmbeddingsConfig, options: VaultIndexingOptions): Promise<void> {
    try {
      console.log(`[ChatGPT MD] Processing file: ${file.path} (${file.stat.size} bytes)`);

      // Skip files that are too large
      const maxFileSize = options.maxFileSize || DEFAULT_INDEXING_OPTIONS.maxFileSize || 1024 * 1024;
      if (file.stat.size > maxFileSize) {
        console.log(`[ChatGPT MD] Skipping large file: ${file.path} (${file.stat.size} bytes)`);
        this.processedFiles++;
        return;
      }

      // Skip files with "Untitled X" naming pattern that are empty or nearly empty
      const fileName = file.basename;
      const isUntitledWithNumber = /^Untitled\s+\d+$/.test(fileName);

      if (isUntitledWithNumber && file.stat.size < 50) {
        // Less than 50 bytes is considered empty or nearly empty
        console.log(`[ChatGPT MD] Skipping empty untitled file: ${file.path} (${file.stat.size} bytes)`);
        this.processedFiles++;
        return;
      }

      // Read the file content
      const content = await this.embeddingsService.getFileContent(file, this.vault);

      // Additional check for empty content
      if (isUntitledWithNumber && content.trim().length === 0) {
        console.log(`[ChatGPT MD] Skipping untitled file with empty content: ${file.path}`);
        this.processedFiles++;
        return;
      }

      // Prepend file title to content to give it more weight in embeddings
      const contentWithTitle = `# ${fileName}\n\n${content}`;

      console.log(
        `[ChatGPT MD] Read content from file: ${file.path} (${contentWithTitle.length} characters), title: ${fileName}`
      );

      // Process the file based on its size
      const chunkSize = options.chunkSize || DEFAULT_INDEXING_OPTIONS.chunkSize || 10000;
      if (contentWithTitle.length <= chunkSize) {
        // Small file, process the whole content
        console.log(`[ChatGPT MD] Generating embeddings for entire file: ${file.path}`);
        const embeddings = await this.embeddingsService.generateEmbeddings(contentWithTitle, config);

        if (!embeddings || !embeddings.length) {
          console.warn(`[ChatGPT MD] Failed to generate embeddings for file: ${file.path} - embeddings are invalid`);
          this.processedFiles++;
          return;
        }

        console.log(`[ChatGPT MD] Adding file to vector database: ${file.path} (${embeddings.length} dimensions)`);
        await this.vectorDatabase.addFile(file, content, embeddings);
      } else {
        // Large file, process in chunks (for now, just use the first chunk)
        // Always include the title in the first chunk
        const titleSection = `# ${fileName}\n\n`;
        const availableChunkSize = chunkSize - titleSection.length;
        const contentFirstPart = content.substring(0, availableChunkSize);
        const firstChunk = titleSection + contentFirstPart;

        console.log(
          `[ChatGPT MD] Generating embeddings for first chunk of file: ${file.path} (${firstChunk.length} characters)`
        );
        const embeddings = await this.embeddingsService.generateEmbeddings(firstChunk, config);

        if (!embeddings || !embeddings.length) {
          console.warn(`[ChatGPT MD] Failed to generate embeddings for file: ${file.path} - embeddings are invalid`);
          this.processedFiles++;
          return;
        }

        console.log(`[ChatGPT MD] Adding file to vector database: ${file.path} (${embeddings.length} dimensions)`);
        await this.vectorDatabase.addFile(file, content, embeddings);
      }

      console.log(`[ChatGPT MD] Successfully indexed file: ${file.path}`);
    } catch (err) {
      console.error(`[ChatGPT MD] Error processing file ${file.path}:`, err);
    } finally {
      this.processedFiles++;
    }
  }

  /**
   * Get files to index based on the provided options
   * @param options - Indexing options
   * @returns Array of files to index
   */
  private async getFilesToIndex(options: VaultIndexingOptions): Promise<TFile[]> {
    const files: TFile[] = [];
    const includeFolders = options.includeFolders || [];
    const excludeFolders = options.excludeFolders || DEFAULT_INDEXING_OPTIONS.excludeFolders || [];
    const includeExtensions = options.includeExtensions || DEFAULT_INDEXING_OPTIONS.includeExtensions || [];
    const excludeExtensions = options.excludeExtensions || DEFAULT_INDEXING_OPTIONS.excludeExtensions || [];

    // If specific folders are specified, only check those
    if (includeFolders.length > 0) {
      for (const folderPath of includeFolders) {
        const folder = this.vault.getAbstractFileByPath(folderPath);
        if (folder instanceof TFolder) {
          await this.collectFilesFromFolder(folder, files, excludeFolders, includeExtensions, excludeExtensions);
        }
      }
    } else {
      // Otherwise, check the entire vault
      await this.collectFilesFromFolder(
        this.vault.getRoot(),
        files,
        excludeFolders,
        includeExtensions,
        excludeExtensions
      );
    }

    return files;
  }

  /**
   * Recursively collect files from a folder
   * @param folder - The folder to scan
   * @param files - Array to collect files into
   * @param excludeFolders - Folders to exclude
   * @param includeExtensions - Extensions to include
   * @param excludeExtensions - Extensions to exclude
   */
  private async collectFilesFromFolder(
    folder: TFolder,
    files: TFile[],
    excludeFolders: string[],
    includeExtensions: string[],
    excludeExtensions: string[]
  ): Promise<void> {
    // Skip excluded folders
    if (excludeFolders.some((excluded) => folder.path.includes(excluded))) {
      return;
    }

    for (const child of folder.children) {
      if (child instanceof TFile) {
        // Check extensions
        const extension = child.extension ? `.${child.extension}` : "";

        if (
          (includeExtensions.length === 0 || includeExtensions.includes(extension)) &&
          !excludeExtensions.includes(extension)
        ) {
          files.push(child);
        }
      } else if (child instanceof TFolder) {
        await this.collectFilesFromFolder(child, files, excludeFolders, includeExtensions, excludeExtensions);
      }
    }
  }

  /**
   * Show a progress notice
   * @param processed - Number of processed files
   * @param total - Total number of files
   */
  private async showProgressNotice(processed: number, total: number): Promise<void> {
    const percent = total > 0 ? Math.floor((processed / total) * 100) : 0;
    const message = `Indexing vault: ${processed}/${total} files (${percent}%)`;

    if (this.progressNoticeId) {
      // Update existing notice
      const element = document.getElementById(this.progressNoticeId);
      if (element) {
        element.innerText = message;
      } else {
        // If the element doesn't exist, create a new notice
        this.progressNoticeId = null;
        await this.showProgressNotice(processed, total);
      }
    } else {
      // Create a new notice
      const notice = new Notice(message, 0);
      const noticeElement = notice.noticeEl as HTMLElement;
      const id = `progress-notice-${Date.now()}`;
      noticeElement.id = id;
      this.progressNoticeId = id;
    }
  }

  /**
   * Clear the progress notice
   */
  private clearProgressNotice(): void {
    if (this.progressNoticeId) {
      const element = document.getElementById(this.progressNoticeId);
      if (element) {
        element.remove();
      }
      this.progressNoticeId = null;
    }
  }
}
