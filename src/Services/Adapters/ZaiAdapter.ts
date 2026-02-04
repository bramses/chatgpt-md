import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from Z.AI API (OpenAI-compatible format)
 */
interface ZaiModel extends ProviderModelData {
  id: string;
  object: string;
  owned_by: string;
}

/**
 * Adapter for Z.AI API provider
 * Encapsulates Z.AI-specific logic and configuration
 * Uses OpenAI-compatible API format
 */
export class ZaiAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "zai";
  readonly displayName = "Z.AI";

  getDefaultBaseUrl(): string {
    return "https://api.z.ai/api/paas/v4";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
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
      const headers = this.getAuthHeaders(apiKey!);
      // Z.AI uses OpenAI-compatible /v1/models endpoint
      const modelsUrl = url.endsWith("/") ? `${url}v1/models` : `${url}/v1/models`;
      const models = await makeGetRequest(modelsUrl, headers, this.type);

      if (models.data && Array.isArray(models.data)) {
        return models.data
          .filter((model: ZaiModel) => model.id.toLowerCase().includes("glm"))
          .sort((a: ZaiModel, b: ZaiModel) => a.id.localeCompare(b.id))
          .map((model: ZaiModel) => this.prefixModelId(model.id));
      }

      return [];
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }

  supportsToolCalling(): boolean {
    return true; // Z.AI models support tool calling
  }

  requiresApiKey(): boolean {
    return true; // Z.AI requires an API key
  }
}
