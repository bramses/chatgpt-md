import { requestUrl } from "obsidian";
import { WebSearchResult } from "src/Models/Tool";
import { NotificationService } from "./NotificationService";

/**
 * Service for performing web searches using external APIs
 */
export class WebSearchService {
  constructor(private notificationService: NotificationService) {}

  /**
   * Search using Brave Search API
   * Requires API key (free tier: 1,000 queries/month)
   */
  async searchBrave(query: string, apiKey: string, limit: number = 5): Promise<WebSearchResult[]> {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;

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
   * Expected response format: { results: [{ title, url, snippet }] }
   */
  async searchCustom(query: string, apiUrl: string, apiKey?: string, limit: number = 5): Promise<WebSearchResult[]> {
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
      this.notificationService.showWarning("Custom web search failed. Check your endpoint configuration.");
      return [];
    }
  }

  /**
   * Main search method that routes to the appropriate provider
   */
  async searchWeb(
    args: { query: string; limit?: number },
    provider: "brave" | "custom",
    apiKey?: string,
    customUrl?: string
  ): Promise<WebSearchResult[]> {
    const { query, limit = 5 } = args;
    const maxLimit = Math.min(limit, 10); // Cap at 10 results

    console.log(`[ChatGPT MD] Web search: "${query}" using ${provider}`);

    switch (provider) {
      case "brave":
        if (!apiKey) {
          this.notificationService.showWarning("Brave Search requires an API key. Please configure in settings.");
          return [];
        }
        return this.searchBrave(query, apiKey, maxLimit);

      case "custom":
        if (!customUrl) {
          this.notificationService.showWarning("Custom search requires an API URL. Please configure in settings.");
          return [];
        }
        return this.searchCustom(query, customUrl, apiKey, maxLimit);

      default:
        this.notificationService.showWarning("Unknown search provider. Please configure in settings.");
        return [];
    }
  }
}
