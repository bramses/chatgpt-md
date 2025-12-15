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

  /**
   * Fetch full page content from a URL
   * Uses Obsidian's requestUrl for CORS-safe requests
   */
  async fetchPageContent(url: string): Promise<string> {
    try {
      const response = await requestUrl({ url, method: "GET" });
      const html = response.text;

      // Basic HTML to text conversion
      return this.htmlToText(html);
    } catch (error) {
      console.error(`[ChatGPT MD] Failed to fetch page content: ${url}`, error);
      return "";
    }
  }

  /**
   * Convert HTML to plain text
   * Simple implementation - removes tags and decodes entities
   */
  private htmlToText(html: string): string {
    // Remove script and style tags with content
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");

    // Clean up whitespace
    text = text.replace(/\s+/g, " ").trim();

    // Limit length to avoid overwhelming the LLM
    const maxLength = 10000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + "...[truncated]";
    }

    return text;
  }
}
