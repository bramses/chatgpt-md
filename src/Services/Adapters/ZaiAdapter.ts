import { requestUrl } from "obsidian";
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
 * Z.AI API endpoints
 */
export const ZAI_OPENAI_ENDPOINT = "https://api.z.ai/api/paas/v4";
export const ZAI_ANTHROPIC_ENDPOINT = "https://api.z.ai/api/anthropic";

/**
 * Adapter for Z.AI API provider
 * Encapsulates Z.AI-specific logic and configuration
 *
 * Supports two API modes:
 * - Standard API (OpenAI-compatible): https://api.z.ai/api/paas/v4 - Pay-per-token
 * - Coding Plan API (Anthropic-compatible): https://api.z.ai/api/anthropic - Subscription-based
 *
 * The API mode is automatically detected based on the URL configured in settings.
 */
export class ZaiAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "zai";
  readonly displayName = "Z.AI";

  getDefaultBaseUrl(): string {
    return ZAI_OPENAI_ENDPOINT;
  }

  /**
   * Check if the URL points to the Anthropic-compatible endpoint
   */
  isAnthropicMode(url: string): boolean {
    return url.includes("/api/anthropic");
  }

  /**
   * Get auth headers based on the API mode
   */
  getAuthHeaders(apiKey: string): Record<string, string> {
    // Default to OpenAI-compatible headers
    // For Anthropic mode, use getAuthHeadersForUrl
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Get auth headers based on URL (detects API mode)
   */
  getAuthHeadersForUrl(apiKey: string, url: string): Record<string, string> {
    if (this.isAnthropicMode(url)) {
      return {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "Content-Type": "application/json",
      };
    }
    return this.getAuthHeaders(apiKey);
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

    // For Anthropic-compatible endpoint, return known models
    if (this.isAnthropicMode(url)) {
      return this.fetchAnthropicModeModels(url, apiKey!);
    }

    // OpenAI-compatible endpoint
    try {
      const headers = this.getAuthHeaders(apiKey!);
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

  /**
   * Fetch models for Anthropic-compatible endpoint (Coding Plan)
   */
  private async fetchAnthropicModeModels(url: string, apiKey: string): Promise<string[]> {
    // Known models for GLM Coding Plan
    const knownModels = ["glm-4.7", "glm-4.5-air"];

    try {
      const modelsUrl = `${url.replace(/\/$/, "")}/v1/models`;
      const headers = this.getAuthHeadersForUrl(apiKey, url);

      const response = await requestUrl({
        url: modelsUrl,
        method: "GET",
        headers: headers,
      });

      const data = response.json;

      if (data.data && Array.isArray(data.data)) {
        return data.data
          .filter((model: { id: string }) => model.id)
          .map((model: { id: string }) => this.prefixModelId(model.id))
          .sort();
      }

      return knownModels.map((model) => this.prefixModelId(model));
    } catch (_error) {
      // API may not support models endpoint - return known models
      console.log("[Z.AI] Models endpoint not available for Coding Plan, using known models");
      return knownModels.map((model) => this.prefixModelId(model));
    }
  }

  /**
   * Whether this provider supports the system field (Anthropic-style)
   * Returns true for Anthropic-compatible endpoint
   */
  supportsSystemField(): boolean {
    // This is called without URL context, so we default to false (OpenAI behavior)
    // The actual system field handling happens in the request building
    return false;
  }

  /**
   * Check if system field is supported for a specific URL
   */
  supportsSystemFieldForUrl(url: string): boolean {
    return this.isAnthropicMode(url);
  }

  supportsToolCalling(): boolean {
    return true; // Both Z.AI API modes support tool calling
  }

  requiresApiKey(): boolean {
    return true; // Z.AI requires an API key
  }
}
