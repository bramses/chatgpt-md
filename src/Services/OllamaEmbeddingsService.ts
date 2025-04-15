import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { AI_SERVICE_OLLAMA } from "src/Constants";
import { TFile, Vault } from "obsidian";

// Configuration interface for Ollama embeddings
export interface OllamaEmbeddingsConfig {
  model: string;
  url: string;
  dimensions: number;
}

// Default configuration for Ollama embeddings with mxbai-embed-large
export const DEFAULT_OLLAMA_EMBEDDINGS_CONFIG: OllamaEmbeddingsConfig = {
  model: "mxbai-embed-large",
  url: "http://localhost:11434",
  dimensions: 1024, // mxbai-embed-large has 1024 dimensions
};

/**
 * Service for generating and managing embeddings with Ollama
 */
export class OllamaEmbeddingsService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected serviceType = AI_SERVICE_OLLAMA;

  constructor(errorService?: ErrorService, notificationService?: NotificationService, apiService?: ApiService) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
  }

  /**
   * Get the default config for Ollama embeddings
   */
  getDefaultConfig(): OllamaEmbeddingsConfig {
    return DEFAULT_OLLAMA_EMBEDDINGS_CONFIG;
  }

  /**
   * Generate embeddings for a given text using Ollama API
   * @param text - The text to generate embeddings for
   * @param config - Configuration for the embeddings
   * @returns A promise resolving to an array of embeddings
   */
  async generateEmbeddings(text: string, config: OllamaEmbeddingsConfig): Promise<number[]> {
    try {
      const payload = {
        model: config.model,
        prompt: text,
      };

      const headers = { "Content-Type": "application/json" };
      const endpoint = `${config.url}/api/embeddings`;

      console.log(`[ChatGPT MD] Generating embeddings for text (length: ${text.length}) with model: ${config.model}`);

      const response = await this.apiService.makeNonStreamingRequest(endpoint, payload, headers, this.serviceType);

      if (!response || !response.embedding) {
        console.warn(`[ChatGPT MD] Ollama returned invalid embeddings response:`, response);
        throw new Error("Invalid embeddings response from Ollama");
      }

      // Check if response.embedding is an array and has elements
      if (!Array.isArray(response.embedding) || response.embedding.length === 0) {
        console.warn(`[ChatGPT MD] Ollama returned invalid embeddings format:`, {
          isArray: Array.isArray(response.embedding),
          length: Array.isArray(response.embedding) ? response.embedding.length : 0,
          firstFewItems: Array.isArray(response.embedding) ? response.embedding.slice(0, 5) : null,
        });
        throw new Error("Invalid embeddings format from Ollama");
      }

      // Log some statistics about the returned embeddings
      console.log(`[ChatGPT MD] Received embeddings from Ollama:`, {
        dimensions: response.embedding.length,
        model: config.model,
        hasValues: !!response.embedding.length,
        sampleValues: response.embedding.length > 5 ? response.embedding.slice(0, 5) : [],
      });

      // Return the embeddings from the response
      return response.embedding;
    } catch (err) {
      console.error(`[ChatGPT MD] Error generating embeddings:`, err);
      this.notificationService.showError(`Error generating embeddings: ${err}`);
      throw err;
    }
  }

  /**
   * Extracts the content from a given file
   * @param file - The file to extract content from
   * @param vault - The Obsidian vault
   * @returns A promise resolving to the file content as a string
   */
  async getFileContent(file: TFile, vault: Vault): Promise<string> {
    return await vault.cachedRead(file);
  }

  /**
   * Check if Ollama is available by trying to get embeddings for a small text
   * @param config - Configuration for the embeddings
   * @returns A promise resolving to a boolean indicating if Ollama is available
   */
  async isOllamaAvailable(config: OllamaEmbeddingsConfig): Promise<boolean> {
    try {
      await this.generateEmbeddings("test", config);
      return true;
    } catch (err) {
      console.error(`[ChatGPT MD] Ollama not available:`, err);
      return false;
    }
  }
}
