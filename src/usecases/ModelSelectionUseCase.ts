import { IView } from "../core/abstractions/IView";
import { IEditor } from "../core/abstractions/IEditor";
import { INotificationService } from "../core/abstractions/INotificationService";
import { ChatGPT_MDSettings } from "../Models/Config";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "../Constants";

/**
 * Dependencies required by the ModelSelectionUseCase
 */
export interface ModelSelectionUseCaseDependencies {
  getSettings: () => ChatGPT_MDSettings;
  getFrontmatter: (view: IView, settings: ChatGPT_MDSettings) => any;
  getApiKey: (settings: ChatGPT_MDSettings, aiService: string) => string;
  fetchAvailableModels: (
    urls: { [key: string]: string },
    openAiKey: string,
    openRouterKey: string
  ) => Promise<string[]>;
  updateFrontmatterField: (editor: IEditor, key: string, value: any) => void;
  showModelSelectionModal: (models: string[], onSelect: (model: string) => void) => void;
}

/**
 * Model availability information
 */
export interface ModelAvailability {
  models: string[];
  cached: boolean;
  timestamp: number;
}

/**
 * Result of model selection operation
 */
export interface ModelSelectionResult {
  success: boolean;
  error?: string;
  selectedModel?: string;
  modelsRefreshed?: boolean;
}

/**
 * ModelSelectionUseCase - Handles model selection and availability
 *
 * Manages fetching available models from different AI services, caching,
 * and providing model selection functionality for users.
 */
export class ModelSelectionUseCase {
  private modelCache: Map<string, ModelAvailability> = new Map();
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private dependencies: ModelSelectionUseCaseDependencies,
    private notificationService: INotificationService
  ) {}

  /**
   * Execute model selection workflow
   */
  async execute(editor: IEditor, view: IView, cachedModels: string[] = []): Promise<ModelSelectionResult> {
    try {
      const settings = this.dependencies.getSettings();
      const frontmatter = this.dependencies.getFrontmatter(view, settings);

      // Step 1: Show modal immediately with cached models for instant UX
      const modalPromise = this.showModelSelectionModal(cachedModels, editor);

      // Step 2: Fetch fresh models in background
      const freshModelsPromise = this.fetchFreshModels(frontmatter, settings);

      // Step 3: Wait for both operations
      const [selectedModel, freshModels] = await Promise.all([modalPromise, freshModelsPromise]);

      // Step 4: Check if we need to refresh the modal with new models
      let modelsRefreshed = false;
      if (this.shouldRefreshModal(cachedModels, freshModels) && !selectedModel) {
        modelsRefreshed = true;
        const refreshedModel = await this.showModelSelectionModal(freshModels, editor);
        if (refreshedModel) {
          return {
            success: true,
            selectedModel: refreshedModel,
            modelsRefreshed: true,
          };
        }
      }

      if (selectedModel) {
        return {
          success: true,
          selectedModel,
          modelsRefreshed,
        };
      }

      // User cancelled selection
      return {
        success: false,
        error: "Model selection cancelled",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ChatGPT MD] Model selection error:", error);
      this.notificationService.showError(`Failed to select model: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get available models with caching
   */
  async getAvailableModels(settings: ChatGPT_MDSettings, view?: IView): Promise<string[]> {
    const cacheKey = this.generateCacheKey(settings);
    const cached = this.modelCache.get(cacheKey);

    // Return cached models if still valid
    if (cached && this.isCacheValid(cached)) {
      return cached.models;
    }

    try {
      // Fetch fresh models
      const frontmatter = view ? this.dependencies.getFrontmatter(view, settings) : {};
      const models = await this.fetchFreshModels(frontmatter, settings);

      // Update cache
      this.modelCache.set(cacheKey, {
        models,
        cached: true,
        timestamp: Date.now(),
      });

      return models;
    } catch (error) {
      console.error("[ChatGPT MD] Error fetching models:", error);

      // Return cached models even if expired, or empty array
      return cached?.models || [];
    }
  }

  /**
   * Initialize models cache at startup
   */
  async initializeModelsCache(): Promise<string[]> {
    console.log("[ChatGPT MD] Initializing models cache...");

    try {
      const settings = this.dependencies.getSettings();
      const models = await this.getAvailableModels(settings);

      console.log(`[ChatGPT MD] Cached ${models.length} available models`);
      return models;
    } catch (error) {
      console.error("[ChatGPT MD] Error initializing models cache:", error);
      return [];
    }
  }

  /**
   * Clear models cache (useful for forced refresh)
   */
  clearCache(): void {
    this.modelCache.clear();
  }

  /**
   * Fetch fresh models from all services
   */
  private async fetchFreshModels(frontmatter: any, settings: ChatGPT_MDSettings): Promise<string[]> {
    const urls = this.buildApiUrls(frontmatter, settings);
    const openAiKey = this.dependencies.getApiKey(settings, AI_SERVICE_OPENAI);
    const openRouterKey = this.dependencies.getApiKey(settings, AI_SERVICE_OPENROUTER);

    return await this.dependencies.fetchAvailableModels(urls, openAiKey, openRouterKey);
  }

  /**
   * Show model selection modal and return selected model
   */
  private showModelSelectionModal(models: string[], editor: IEditor): Promise<string | null> {
    return new Promise((resolve) => {
      this.dependencies.showModelSelectionModal(models, (selectedModel: string) => {
        if (selectedModel) {
          // Update frontmatter with selected model
          this.dependencies.updateFrontmatterField(editor, "model", selectedModel);
          this.notificationService.showSuccess(`Model updated to: ${selectedModel}`);
        }
        resolve(selectedModel || null);
      });
    });
  }

  /**
   * Check if we should refresh the modal with new models
   */
  private shouldRefreshModal(cachedModels: string[], freshModels: string[]): boolean {
    if (cachedModels.length !== freshModels.length) return true;

    const cachedSet = new Set(cachedModels);
    const freshSet = new Set(freshModels);

    return (
      ![...cachedSet].every((model) => freshSet.has(model)) || ![...freshSet].every((model) => cachedSet.has(model))
    );
  }

  /**
   * Build API URLs for different services
   */
  private buildApiUrls(frontmatter: any, settings: ChatGPT_MDSettings): { [key: string]: string } {
    return {
      [AI_SERVICE_OPENAI]: frontmatter.openaiUrl || settings.openaiUrl || "https://api.openai.com/v1",
      [AI_SERVICE_OPENROUTER]: frontmatter.openrouterUrl || settings.openrouterUrl || "https://openrouter.ai/api/v1",
      [AI_SERVICE_OLLAMA]: frontmatter.ollamaUrl || settings.ollamaUrl || "http://localhost:11434",
      [AI_SERVICE_LMSTUDIO]: frontmatter.lmstudioUrl || settings.lmstudioUrl || "http://localhost:1234/v1",
      [AI_SERVICE_ANTHROPIC]: frontmatter.anthropicUrl || settings.anthropicUrl || "https://api.anthropic.com/v1",
    };
  }

  /**
   * Generate cache key for settings
   */
  private generateCacheKey(settings: ChatGPT_MDSettings): string {
    return JSON.stringify({
      openaiUrl: settings.openaiUrl,
      openrouterUrl: settings.openrouterUrl,
      ollamaUrl: settings.ollamaUrl,
      lmstudioUrl: settings.lmstudioUrl,
      anthropicUrl: settings.anthropicUrl,
    });
  }

  /**
   * Check if cached models are still valid
   */
  private isCacheValid(cached: ModelAvailability): boolean {
    return Date.now() - cached.timestamp < this.CACHE_DURATION_MS;
  }
}
