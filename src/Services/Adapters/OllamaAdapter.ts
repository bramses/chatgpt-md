import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from Ollama API
 */
interface OllamaModel extends ProviderModelData {
  name: string;
}

/**
 * Adapter for Ollama (local) API provider
 * Encapsulates Ollama-specific logic and configuration
 */
export class OllamaAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "ollama";
  readonly displayName = "Ollama";

  getDefaultBaseUrl(): string {
    return "http://localhost:11434";
  }

  getAuthHeaders(apiKey: string | undefined): Record<string, string> {
    // Ollama doesn't require authentication
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
      const json = await makeGetRequest(`${url}/api/tags`, headers, this.type);
      const models = json.models;

      return models
        .sort((a: OllamaModel, b: OllamaModel) => {
          if (a.name < b.name) return 1;
          if (a.name > b.name) return -1;
          return 0;
        })
        .map((model: OllamaModel) => this.prefixModelId(model.name));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }

  requiresApiKey(): boolean {
    return false; // Ollama doesn't require API key
  }
}
