import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from OpenRouter API
 */
interface OpenRouterModel extends ProviderModelData {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  supported_parameters?: string[];
}

/**
 * Adapter for OpenRouter API provider
 * Encapsulates OpenRouter-specific logic and configuration
 */
export class OpenRouterAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "openrouter";
  readonly displayName = "OpenRouter";

  getDefaultBaseUrl(): string {
    return "https://openrouter.ai";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * OpenRouter requires /api/v1 prefix for all endpoints
   * @param url - Optional URL parameter (ignored by OpenRouter)
   */
  override getApiPathSuffix(_url?: string): string {
    return "/api/v1";
  }

  async fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    if (!this.validateApiKey(apiKey)) {
      return [];
    }

    try {
      const headers = this.getAuthHeaders(apiKey!); // Non-null assertion: validated above
      const apiPath = this.getApiPathSuffix(url);
      const models = await makeGetRequest(`${url}${apiPath}/models`, headers, this.type);

      return models.data
        .sort((a: OpenRouterModel, b: OpenRouterModel) => {
          if (a.id < b.id) return 1;
          if (a.id > b.id) return -1;
          return 0;
        })
        .map((model: OpenRouterModel) => this.prefixModelId(model.id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }
}
