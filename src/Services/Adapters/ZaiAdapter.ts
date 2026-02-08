import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Adapter for Z.AI API provider
 * Encapsulates Z.AI-specific logic and configuration
 *
 * Uses createOpenAICompatible to avoid V2/V3 specification compatibility warnings.
 *
 * Supports two API modes:
 * - Standard API (OpenAI-compatible): /api/paas/v4 - Pay-per-token
 * - Coding Plan API (Anthropic-compatible): /api/anthropic - Subscription-based
 *
 * The API mode is determined by the URL configured in settings:
 * - URLs containing "anthropic" use Coding Plan mode
 * - All other URLs use Standard mode (default)
 *
 * Z.AI does not provide a models endpoint, so we return known models directly.
 */
export class ZaiAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "zai";
  readonly displayName = "Z.AI";

  /**
   * Known Z.AI models
   * Z.AI API does not have a models endpoint, so we return this list directly
   */
  private readonly KNOWN_MODELS = [
    "glm-4.5",
    "glm-4.6",
    "glm-4.6v",
    "glm-4.6v-flash",
    "glm-4.6v-flashx",
    "glm-4.7",
    "glm-4.7-flash",
  ];

  getDefaultBaseUrl(): string {
    return "https://api.z.ai";
  }

  /**
   * Check if the URL points to the Anthropic-compatible Coding Plan endpoint
   * Detection based on URL path containing "anthropic"
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

  /**
   * Get the API path suffix for the provider
   * For Standard API mode: return full path for Zhipu provider
   * For Coding Plan (Anthropic-compatible): return the Anthropic path
   */
  override getApiPathSuffix(url?: string): string {
    // If URL is provided, detect mode from it
    if (url) {
      if (this.isAnthropicMode(url)) {
        return "/api/anthropic/v1";
      }
    }
    // Default to Standard API mode - return full path for Z.AI international API
    return "/api/paas/v4";
  }

  async fetchModels(
    _url: string,
    apiKey: string | undefined,
    _settings: ChatGPT_MDSettings | undefined,
    _makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    if (!this.validateApiKey(apiKey)) {
      return [];
    }

    // Z.AI does not have a models endpoint
    // Return known models directly
    return this.KNOWN_MODELS.map((model) => this.prefixModelId(model)).sort();
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
