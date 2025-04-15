import { App, TFile } from "obsidian";
import { OllamaEmbeddingsConfig, OllamaEmbeddingsService } from "./OllamaEmbeddingsService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

/**
 * IndexedDB vector database service for storing and searching embeddings
 */
export class VectorDatabaseService {
  protected embeddingsService: OllamaEmbeddingsService;
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  private app: App;
  private dbInitialized = false;
  private vectorDimensions: number;

  // IndexedDB access
  private db: IDBDatabase | null = null;
  private DB_NAME = "vector-database";
  private DB_VERSION = 1;
  private FILE_STORE = "files";
  private VECTOR_STORE = "vectors";

  constructor(
    app: App,
    embeddingsService?: OllamaEmbeddingsService,
    errorService?: ErrorService,
    notificationService?: NotificationService
  ) {
    this.app = app;
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.embeddingsService =
      embeddingsService || new OllamaEmbeddingsService(this.errorService, this.notificationService);
    this.vectorDimensions = this.embeddingsService.getDefaultConfig().dimensions;
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<boolean> {
    try {
      // Open IndexedDB database
      const openRequest = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      // Set up the database schema when needed
      openRequest.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create a store for files
        if (!db.objectStoreNames.contains(this.FILE_STORE)) {
          const fileStore = db.createObjectStore(this.FILE_STORE, { keyPath: "path" });
          fileStore.createIndex("path_idx", "path", { unique: true });
          fileStore.createIndex("mtime_idx", "mtime", { unique: false });
        }

        // Create a store for vectors
        if (!db.objectStoreNames.contains(this.VECTOR_STORE)) {
          const vectorStore = db.createObjectStore(this.VECTOR_STORE, { keyPath: "id", autoIncrement: true });
          vectorStore.createIndex("path_idx", "path", { unique: false });
        }
      };

      // Return a promise that resolves when the database is opened
      return new Promise((resolve, reject) => {
        openRequest.onerror = (event) => {
          console.error("IndexedDB error:", event);
          reject(new Error("Failed to open IndexedDB database"));
        };

        openRequest.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          this.dbInitialized = true;
          resolve(true);
        };
      });
    } catch (err) {
      console.error("[ChatGPT MD] Error initializing vector database:", err);
      this.notificationService.showError(`Error initializing vector database: ${err}`);
      return false;
    }
  }

  /**
   * Check if the database is initialized
   */
  isInitialized(): boolean {
    return this.dbInitialized && this.db !== null;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbInitialized = false;
    }
  }

  /**
   * Add a file to the vector database
   * @param file - The file to add
   * @param content - The file content
   * @param embeddings - The embeddings for the file
   */
  async addFile(file: TFile, content: string, embeddings: number[]): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    try {
      const fileData = {
        path: file.path,
        name: file.basename,
        mtime: file.stat?.mtime || Date.now(),
        content: content,
      };

      const vectorData = {
        path: file.path,
        vector: embeddings,
      };

      // Store file data
      await this.storeObject(this.FILE_STORE, fileData);

      // Store vector data
      await this.storeObject(this.VECTOR_STORE, vectorData);
    } catch (err) {
      console.error("[ChatGPT MD] Error adding file to vector database:", err);
      throw err;
    }
  }

  /**
   * Remove a file from the vector database
   * @param path - The file path to remove
   */
  async removeFile(path: string): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    try {
      // Delete file data
      await this.deleteObject(this.FILE_STORE, path);

      // Delete vector data (first need to find all vectors for this path)
      const vectors = await this.getAllVectorsForPath(path);
      for (const vector of vectors) {
        if (vector.id) {
          await this.deleteObject(this.VECTOR_STORE, vector.id);
        }
      }
    } catch (err) {
      console.error("[ChatGPT MD] Error removing file from vector database:", err);
      throw err;
    }
  }

  /**
   * Search for files similar to the query text
   * @param queryText - The text to search for
   * @param config - The embeddings configuration
   * @param limit - The maximum number of results to return
   * @returns Array of matching files with similarity scores
   */
  async search(
    queryText: string,
    config: OllamaEmbeddingsConfig,
    limit: number = 5
  ): Promise<{ path: string; name: string; similarity: number }[]> {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    try {
      // Generate embeddings for the query text
      const queryEmbeddings = await this.embeddingsService.generateEmbeddings(queryText, config);

      // Get all vectors and files
      const vectors = await this.getAllVectors();
      const files = await this.getAllFiles();

      // Map of file paths to file objects
      const fileMap = new Map();
      files.forEach((file) => {
        fileMap.set(file.path, file);
      });

      // Calculate similarity for each vector
      const results = [];
      for (const vector of vectors) {
        // Check if vector has a valid vector property
        if (!vector || !vector.vector || !Array.isArray(vector.vector)) {
          console.warn(`[ChatGPT MD] Invalid vector found in database:`, vector);
          continue;
        }

        try {
          const similarity = this.calculateCosineSimilarity(queryEmbeddings, vector.vector);
          const file = fileMap.get(vector.path);

          if (file) {
            results.push({
              path: vector.path,
              name: file.name,
              similarity: similarity,
            });
          }
        } catch (err) {
          console.warn(`[ChatGPT MD] Error calculating similarity for vector:`, vector, err);
          continue;
        }
      }

      // Sort by similarity (descending) and return the top matches
      return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    } catch (err) {
      console.error("[ChatGPT MD] Error searching vector database:", err);
      throw err;
    }
  }

  /**
   * Get statistics about the vector database
   * @returns Object with database statistics
   */
  async getStats(): Promise<{ fileCount: number; vectorCount: number }> {
    if (!this.isInitialized()) {
      return { fileCount: 0, vectorCount: 0 };
    }

    try {
      const files = await this.getAllFiles();
      const vectors = await this.getAllVectors();

      return {
        fileCount: files.length,
        vectorCount: vectors.length,
      };
    } catch (err) {
      console.error("[ChatGPT MD] Error getting vector database stats:", err);
      return { fileCount: 0, vectorCount: 0 };
    }
  }

  /**
   * Cleans up invalid vectors from the database
   * @returns Number of invalid vectors removed
   */
  async cleanupInvalidVectors(): Promise<number> {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    try {
      const vectors = await this.getAllVectors();
      let removedCount = 0;

      for (const vector of vectors) {
        if (!vector || !vector.vector || !Array.isArray(vector.vector)) {
          console.log(`[ChatGPT MD] Removing invalid vector for path: ${vector?.path || "unknown"}`);

          if (vector?.id) {
            await this.deleteObject(this.VECTOR_STORE, vector.id);
            removedCount++;
          }
        }
      }

      return removedCount;
    } catch (err) {
      console.error("[ChatGPT MD] Error cleaning up invalid vectors:", err);
      throw err;
    }
  }

  /**
   * Clear all data from the database
   * @returns Object with counts of deleted files and vectors
   */
  async clearDatabase(): Promise<{ deletedFiles: number; deletedVectors: number }> {
    if (!this.isInitialized()) {
      throw new Error("Database not initialized");
    }

    try {
      // Get counts before deletion for reporting
      const stats = await this.getStats();

      // Clear the file store
      await this.clearObjectStore(this.FILE_STORE);

      // Clear the vector store
      await this.clearObjectStore(this.VECTOR_STORE);

      console.log(`[ChatGPT MD] Database cleared: ${stats.fileCount} files and ${stats.vectorCount} vectors deleted`);

      return {
        deletedFiles: stats.fileCount,
        deletedVectors: stats.vectorCount,
      };
    } catch (err) {
      console.error("[ChatGPT MD] Error clearing database:", err);
      throw err;
    }
  }

  /**
   * Helper method to clear all objects from a store
   */
  private clearObjectStore(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Helper method to store an object in a given store
   */
  private storeObject(storeName: string, object: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(object);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Helper method to delete an object from a given store
   */
  private deleteObject(storeName: string, key: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all files from the database
   */
  private getAllFiles(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(this.FILE_STORE, "readonly");
      const store = transaction.objectStore(this.FILE_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all vectors from the database
   */
  private getAllVectors(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(this.VECTOR_STORE, "readonly");
      const store = transaction.objectStore(this.VECTOR_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all vectors for a specific file path
   */
  private getAllVectorsForPath(path: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error("Database not initialized"));
        return;
      }

      const transaction = this.db.transaction(this.VECTOR_STORE, "readonly");
      const store = transaction.objectStore(this.VECTOR_STORE);
      const index = store.index("path_idx");
      const request = index.getAll(path);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Calculate the cosine similarity between two vectors
   * @param vec1 - First vector
   * @param vec2 - Second vector
   * @returns The cosine similarity score (0-1)
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!Array.isArray(vec1) || !Array.isArray(vec2)) {
      throw new Error("Invalid input: vectors must be arrays");
    }

    if (vec1.length !== vec2.length) {
      throw new Error(`Vectors must have the same dimensions: ${vec1.length} vs ${vec2.length}`);
    }

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      magnitude1 += vec1[i] * vec1[i];
      magnitude2 += vec2[i] * vec2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }
}
