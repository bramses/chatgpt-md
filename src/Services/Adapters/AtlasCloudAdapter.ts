import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/** OpenAI-compatible adapter for Atlas Cloud text models. */
export class AtlasCloudAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "atlascloud";
  readonly displayName = "Atlas Cloud";

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async fetchModels(
    url: string,
    apiKey: string | undefined,
    _settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<unknown>
  ): Promise<string[]> {
    if (!this.validateApiKey(apiKey)) return [];

    try {
      const baseUrl = url.replace(/\/+$/, "");
      const response = await makeGetRequest(
        `${baseUrl}${this.getApiPathSuffix(baseUrl)}/models`,
        this.getAuthHeaders(apiKey!),
        this.type
      );
      return this.getObjectArray(response, "data")
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .sort((a, b) => a.localeCompare(b))
        .map((id) => this.prefixModelId(id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }
}
