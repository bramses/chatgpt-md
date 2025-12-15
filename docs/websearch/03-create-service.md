# Task 3: Create WebSearchService

## Priority: HIGH
## File: src/Services/WebSearchService.ts (NEW)

## Goal

Create a new service to handle web search operations using external search APIs.

## Implementation

Create `src/Services/WebSearchService.ts`:

```typescript
import { requestUrl } from "obsidian";
import { WebSearchResult } from "src/Models/Tool";
import { NotificationService } from "./NotificationService";

/**
 * Service for performing web searches using external APIs
 */
export class WebSearchService {
  constructor(private notificationService: NotificationService) {}

  /**
   * Search the web using DuckDuckGo Instant Answer API
   * Free, no API key required
   */
  async searchDuckDuckGo(query: string, limit: number = 5): Promise<WebSearchResult[]> {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

      const response = await requestUrl({ url, method: "GET" });
      const data = response.json;

      const results: WebSearchResult[] = [];

      // Add abstract if available
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      // Add related topics
      for (const topic of data.RelatedTopics?.slice(0, limit - results.length) || []) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] || topic.Text.substring(0, 50),
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
        // Handle nested topics (groups)
        if (topic.Topics) {
          for (const subTopic of topic.Topics.slice(0, limit - results.length)) {
            if (subTopic.Text && subTopic.FirstURL) {
              results.push({
                title: subTopic.Text.split(" - ")[0] || subTopic.Text.substring(0, 50),
                url: subTopic.FirstURL,
                snippet: subTopic.Text,
              });
            }
          }
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      console.error("[ChatGPT MD] DuckDuckGo search error:", error);
      this.notificationService.showWarning("Web search failed. Please try again.");
      return [];
    }
  }

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
    provider: "duckduckgo" | "brave" | "custom",
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

      case "duckduckgo":
      default:
        return this.searchDuckDuckGo(query, maxLimit);
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
```

## Location

Create new file at `src/Services/WebSearchService.ts`.

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

- Task 1 (types) must be completed

## Notes

- Uses Obsidian's `requestUrl` for CORS-safe requests
- DuckDuckGo is the default (free, no API key)
- Brave requires an API key but provides better results
- Custom endpoint allows self-hosted solutions like SearXNG

## Next Task

[04-create-modal](./04-create-modal.md)
