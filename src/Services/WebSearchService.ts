import { requestUrl } from "obsidian";
import { NotificationService } from "./NotificationService";
import { WebSearchResult } from "src/Models/Tool";

/**
 * Maximum number of web search results to return
 */
const MAX_WEB_RESULTS = 10;

/**
 * Web Search Service
 *
 * Handles external web search integration for AI tools:
 * - Brave Search API (free tier: 1,000 queries/month)
 * - Custom search endpoints
 *
 * Features:
 * - Provider-specific implementations
 * - Error handling with user notifications
 * - Configurable result limits
 */
export class WebSearchService {
  constructor(private notificationService: NotificationService) {}

  /**
   * Search using Brave Search API
   *
   * Requires API key (free tier available at https://api.search.brave.com/app/keys)
   *
   * @param query - Search query string
   * @param apiKey - Brave Search API key
   * @param limit - Maximum number of results (capped at MAX_WEB_RESULTS)
   * @returns Array of web search results
   */
  private async searchBrave(
    query: string,
    apiKey: string,
    limit: number = 5
  ): Promise<WebSearchResult[]> {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query
      )}&count=${limit}`;

      const response = await requestUrl({
        url,
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
      });

      const data = response.json;

      return (
        data.web?.results?.map((result: any) => ({
          title: result.title,
          url: result.url,
          snippet: result.description,
        })) || []
      );
    } catch (error) {
      console.error("[ChatGPT MD] Brave search error:", error);
      this.notificationService.showWarning("Web search failed. Check your API key.");
      return [];
    }
  }

  /**
   * Search using a custom API endpoint
   *
   * Supports any custom endpoint that returns:
   * { results: [{ title, url, snippet }] }
   *
   * @param query - Search query string
   * @param apiUrl - Custom API endpoint URL
   * @param apiKey - Optional API key for authentication
   * @param limit - Maximum number of results (capped at MAX_WEB_RESULTS)
   * @returns Array of web search results
   */
  private async searchCustom(
    query: string,
    apiUrl: string,
    apiKey?: string,
    limit: number = 5
  ): Promise<WebSearchResult[]> {
    try {
      const url = `${apiUrl}?q=${encodeURIComponent(query)}&limit=${limit}`;

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await requestUrl({ url, method: "GET", headers });
      const data = response.json;

      return (
        data.results?.slice(0, limit).map((result: any) => ({
          title: result.title || "Untitled",
          url: result.url || result.link || "",
          snippet: result.snippet || result.description || "",
        })) || []
      );
    } catch (error) {
      console.error("[ChatGPT MD] Custom search error:", error);
      this.notificationService.showWarning(
        "Custom web search failed. Check your endpoint configuration."
      );
      return [];
    }
  }

  /**
   * Main search method that routes to the appropriate provider
   *
   * Supports two providers:
   * - "brave": Official Brave Search API
   * - "custom": User-defined endpoint
   *
   * @param args - Search parameters (query, limit)
   * @param provider - Search provider to use
   * @param apiKey - API key for the provider
   * @param customUrl - Custom endpoint URL (for "custom" provider)
   * @returns Array of web search results
   */
  async searchWeb(
    args: { query: string; limit?: number },
    provider: "brave" | "custom",
    apiKey?: string,
    customUrl?: string
  ): Promise<WebSearchResult[]> {
    const { query, limit = 5 } = args;
    const maxLimit = Math.min(limit, MAX_WEB_RESULTS); // Cap at MAX_WEB_RESULTS

    console.log(`[ChatGPT MD] Web search: "${query}" using ${provider}`);

    switch (provider) {
      case "brave":
        if (!apiKey) {
          this.notificationService.showWarning(
            "Brave Search requires an API key. Please configure in settings."
          );
          return [];
        }
        return this.searchBrave(query, apiKey, maxLimit);

      case "custom":
        if (!customUrl) {
          this.notificationService.showWarning(
            "Custom search requires an API URL. Please configure in settings."
          );
          return [];
        }
        return this.searchCustom(query, customUrl, apiKey, maxLimit);

      default:
        this.notificationService.showWarning(
          "Unknown search provider. Please configure in settings."
        );
        return [];
    }
  }
}
