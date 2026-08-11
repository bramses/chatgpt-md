import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Adapter for OrcaRouter API provider
 * Encapsulates OrcaRouter-specific logic and configuration
 *
 * OrcaRouter exposes an OpenAI-compatible API at /v1, so we use the standard
 * /v1 path suffix and discover available models from the /v1/models endpoint
 * (OrcaRouter serves its full model catalog there, unlike Z.AI).
 */
export class OrcaRouterAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "orcarouter";
  readonly displayName = "OrcaRouter";

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
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<unknown>
  ): Promise<string[]> {
    if (!this.validateApiKey(apiKey)) {
      return [];
    }

    try {
      const headers = this.getAuthHeaders(apiKey!); // Non-null assertion: validated above
      const apiPath = this.getApiPathSuffix(url);
      const response = await makeGetRequest(`${url}${apiPath}/models`, headers, this.type);
      const modelIds = this.getObjectArray(response, "data")
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string");

      return modelIds.sort((a, b) => b.localeCompare(a)).map((id) => this.prefixModelId(id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }
}
