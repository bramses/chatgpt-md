import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderAdapter, ProviderType } from "./ProviderAdapter";

/**
 * Abstract base class for provider adapters
 * Implements common functionality shared across all providers
 */
export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract readonly type: ProviderType;
  abstract readonly displayName: string;

  /**
   * Get the default base URL for this provider
   */
  abstract getDefaultBaseUrl(): string;

  /**
   * Get authentication headers for API requests
   */
  abstract getAuthHeaders(apiKey: string): Record<string, string>;

  /**
   * Fetch available models from this provider
   */
  abstract fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]>;

  /**
   * Get the system message role for this provider
   * Default: "system" (OpenAI overrides to "developer")
   */
  getSystemMessageRole(): "system" | "developer" {
    return "system";
  }

  /**
   * Whether this provider supports a system field in the API payload
   * Default: false (Anthropic overrides to true)
   */
  supportsSystemField(): boolean {
    return false;
  }

  /**
   * Whether this provider supports tool calling
   * Default: true
   */
  supportsToolCalling(): boolean {
    return true;
  }

  /**
   * Whether this provider requires an API key
   * Default: true (Ollama and LM Studio override to false)
   */
  requiresApiKey(): boolean {
    return true;
  }

  /**
   * Extract the model name from a full model ID with provider prefix
   * Common implementation for all providers
   */
  extractModelName(modelId: string): string {
    // Remove provider prefix if present
    if (modelId.startsWith(`${this.type}@`)) {
      return modelId.substring(this.type.length + 1);
    }
    return modelId;
  }

  /**
   * Add provider prefix to model ID
   * Common implementation for all providers
   */
  protected prefixModelId(modelId: string): string {
    return `${this.type}@${modelId}`;
  }

  /**
   * Handle fetch models error with consistent logging
   */
  protected handleFetchError(error: any, customMessage?: string): void {
    const errorMessage = customMessage || `Error fetching ${this.displayName} models`;
    console.error(`${errorMessage}:`, error);
  }

  /**
   * Validate API key is present
   */
  protected validateApiKey(apiKey: string | undefined): boolean {
    if (!apiKey && this.requiresApiKey()) {
      console.error(
        `${this.displayName} API key is missing. Please add your ${this.displayName} API key in the settings.`
      );
      return false;
    }
    return true;
  }
}
