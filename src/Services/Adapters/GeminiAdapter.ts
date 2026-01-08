import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from Gemini API
 */
interface GeminiModel extends ProviderModelData {
  name: string;
  displayName: string;
}

/**
 * Adapter for Google Gemini API provider
 * Encapsulates Gemini-specific logic and configuration
 */
export class GeminiAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "gemini";
  readonly displayName = "Gemini";

  getDefaultBaseUrl(): string {
    return "https://generativelanguage.googleapis.com";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    // Gemini uses API key as query parameter, not in headers
    return {
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
      // Gemini API key is passed as query parameter
      const modelsUrl = `${url}/v1beta/models?key=${apiKey}`;
      const headers = this.getAuthHeaders(apiKey!); // Non-null assertion: validated above
      const response = await makeGetRequest(modelsUrl, headers, this.type);

      if (response.models && Array.isArray(response.models)) {
        return response.models
          .filter((model: GeminiModel) => model.name && model.name.includes("generate"))
          .map((model: GeminiModel) => {
            // Extract model name from full resource path
            const modelId = model.name.split("/").pop();
            return this.prefixModelId(modelId!);
          })
          .sort();
      }

      return [];
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }
}
