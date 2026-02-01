import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from LM Studio API (OpenAI-compatible format)
 */
interface LMStudioModel extends ProviderModelData {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * Adapter for LM Studio (local) API provider
 * Encapsulates LM Studio-specific logic and configuration
 * Uses OpenAI-compatible API format
 */
export class LmStudioAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "lmstudio";
  readonly displayName = "LM Studio";

  getDefaultBaseUrl(): string {
    return "http://localhost:1234";
  }

  getAuthHeaders(apiKey: string | undefined): Record<string, string> {
    // LM Studio doesn't require authentication
    return { "Content-Type": "application/json" };
  }

  async fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    try {
      const headers = this.getAuthHeaders(apiKey);
      const models = await makeGetRequest(`${url}/v1/models`, headers, this.type);

      if (models.data && Array.isArray(models.data)) {
        return models.data.map((model: LMStudioModel) => this.prefixModelId(model.id)).sort();
      }

      return [];
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }

  supportsToolCalling(): boolean {
    return false; // Most local models don't support tool calling
  }

  requiresApiKey(): boolean {
    return false; // LM Studio doesn't require API key
  }
}
