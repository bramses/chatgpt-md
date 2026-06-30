import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Adapter for Requesty API provider
 * Encapsulates Requesty-specific logic and configuration.
 *
 * Requesty (https://requesty.ai) is an OpenAI-compatible LLM gateway, similar to
 * OpenRouter. It uses:
 * - Base URL: https://router.requesty.ai
 * - API path suffix: /v1 (standard OpenAI-compatible path)
 * - Bearer token authentication
 * - provider/model naming convention (e.g. "openai/gpt-4o", "anthropic/claude-3.5-sonnet")
 *
 * This adapter mirrors the OpenRouterAdapter but targets the Requesty endpoint and
 * the standard /v1 path. Because Requesty is OpenAI-compatible, the AI SDK uses
 * createOpenAICompatible to build the provider instance.
 */
export class RequestyAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "requesty";
  readonly displayName = "Requesty";

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Requesty uses the standard OpenAI-compatible /v1 prefix.
   *
   * This is combined with the base URL to form the complete baseURL passed to the AI SDK:
   * - Base URL: https://router.requesty.ai (from DEFAULT_REQUESTY_CONFIG.url)
   * - Path suffix: /v1 (inherited default, skipped when the URL already ends in /v1)
   * - Result: https://router.requesty.ai/v1 (passed as baseURL to createOpenAICompatible)
   * - Final endpoint: https://router.requesty.ai/v1/chat/completions
   */
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
