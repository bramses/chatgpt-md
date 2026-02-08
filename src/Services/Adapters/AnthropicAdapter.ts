import { requestUrl } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from Anthropic API
 */
interface AnthropicModel extends ProviderModelData {
  id: string;
  type: string;
}

/**
 * Adapter for Anthropic (Claude) API provider
 * Encapsulates Anthropic-specific logic and configuration
 */
export class AnthropicAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "anthropic";
  readonly displayName = "Anthropic";

  getDefaultBaseUrl(): string {
    return "https://api.anthropic.com";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
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
      const apiPath = this.getApiPathSuffix(url);
      const modelsUrl = `${url.replace(/\/$/, "")}${apiPath}/models`;
      const headers = this.getAuthHeaders(apiKey!); // Non-null assertion: validated above

      // Anthropic uses requestUrl directly (not through apiService)
      const response = await requestUrl({
        url: modelsUrl,
        method: "GET",
        headers: headers,
      });

      const data = response.json;

      if (data.data && Array.isArray(data.data)) {
        return data.data
          .filter((model: AnthropicModel) => model.type === "model" && model.id)
          .map((model: AnthropicModel) => this.prefixModelId(model.id))
          .sort();
      }

      console.warn("Unexpected response format from Anthropic models API");
      return [];
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }

  supportsSystemField(): boolean {
    return true; // Anthropic supports system field in payload
  }
}
