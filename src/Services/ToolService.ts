import { App, TFile } from "obsidian";
import { requestUrl } from "obsidian";
import { z } from "zod";
import { tool, zodSchema } from "ai";
import { FileService } from "./FileService";
import { NotificationService } from "./NotificationService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { SearchResultsApprovalModal } from "src/Views/SearchResultsApprovalModal";
import { WebSearchApprovalModal } from "src/Views/WebSearchApprovalModal";
import { ToolApprovalModal } from "src/Views/ToolApprovalModal";
import { FileReadResult, ToolExecutionContext, VaultSearchResult, WebSearchResult, ToolApprovalDecision, ToolApprovalRequest } from "src/Models/Tool";

/**
 * Handler for processing tool results
 */
type ToolResultHandler = (
  result: any,
  toolCall: any,
  filteredResults: any[],
  contextMessages: Array<{ role: "user"; content: string }>,
  modelName?: string
) => Promise<void>;

/**
 * Unified Tool Service
 * Consolidates all tool-related functionality:
 * - Tool registration (from ToolRegistry)
 * - Vault operations (from VaultTools)
 * - Web search (from WebSearchService)
 * - Tool orchestration and approval (from ToolService)
 */
export class ToolService {
  private approvalHandler?: (toolName: string, args: any) => Promise<any>;
  private readonly toolResultHandlers: Record<string, ToolResultHandler>;
  private readonly tools: Map<string, any> = new Map();

  constructor(
    private app: App,
    private fileService: FileService,
    private notificationService: NotificationService,
    private settingsService: ChatGPT_MDSettings
  ) {
    this.toolResultHandlers = {
      vault_search: this.handleVaultSearchResult.bind(this),
      file_read: this.handleFileReadResult.bind(this),
      web_search: this.handleWebSearchResult.bind(this),
    };

    // Register default tools
    this.registerDefaultTools();
  }

  // ========== Tool Registration (from ToolRegistry) ==========

  /**
   * Register default tools with manual human-in-the-loop approval
   */
  private registerDefaultTools(): void {
    // Vault search tool - approval handled manually before execution
    const vaultSearchTool = tool({
      description:
        "Search the Obsidian vault for files by name or content. Returns file paths, names, and content previews. Use this to find relevant notes before reading them.",
      inputSchema: zodSchema(
        z.object({
          query: z
            .string()
            .describe(
              "The search query to find files. Can be keywords, topics, or phrases to search for in file names and content."
            ),
          limit: z
            .number()
            .optional()
            .default(10)
            .describe("Maximum number of search results to return. Default is 10, maximum is 50."),
        })
      ),
      execute: async (args: { query: string; limit?: number }) => {
        // Tool execution - approval is handled by the caller via requestApproval
        const results = await this.searchVault(args, {
          app: this.app,
          toolCallId: "",
          messages: [],
        });

        // Format results with markdown links for file paths
        return results.map((result) => ({
          ...result,
          path: `[${result.basename}](${result.path})`,
        }));
      },
    });
    this.registerTool("vault_search", vaultSearchTool);

    // File read tool - approval handled manually before execution
    const fileReadTool = tool({
      description:
        "Read the full contents of specific files from the vault. User will be asked to approve which files to share. Use this after searching to get complete file contents.",
      inputSchema: zodSchema(
        z.object({
          filePaths: z
            .array(z.string())
            .describe("Array of file paths to read. Use the paths returned from vault_search."),
        })
      ),
      execute: async (args: { filePaths: string[] }) => {
        // Tool execution - approval is handled by the caller via requestApproval
        return await this.readFiles(args, {
          app: this.app,
          toolCallId: "",
          messages: [],
        });
      },
    });
    this.registerTool("file_read", fileReadTool);

    // Web search tool - approval handled manually before execution
    const webSearchTool = tool({
      description:
        "Search the web for information on a topic. Returns titles, URLs, and snippets from search results. User will be asked to approve which results to share.",
      inputSchema: zodSchema(
        z.object({
          query: z.string().describe("The search query to look up on the web"),
          limit: z
            .number()
            .optional()
            .default(5)
            .describe("Maximum number of search results to return. Default is 5, maximum is 10."),
        })
      ),
      execute: async (args: { query: string; limit?: number }) => {
        // Tool execution - approval is handled by the caller via requestApproval
        return await this.searchWeb(
          args,
          this.settingsService.webSearchProvider,
          this.settingsService.webSearchApiKey,
          this.settingsService.webSearchApiUrl
        );
      },
    });
    this.registerTool("web_search", webSearchTool);
  }

  /**
   * Register a new tool
   */
  registerTool(name: string, toolDef: any): void {
    this.tools.set(name, toolDef);
    console.log(`[ChatGPT MD] Registered tool: ${name}`);
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): any | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Record<string, any> {
    const toolsObject: Record<string, any> = {};
    this.tools.forEach((toolDef, name) => {
      toolsObject[name] = toolDef;
    });
    return toolsObject;
  }

  /**
   * Get tools enabled for a request based on settings
   */
  getEnabledTools(settings: ChatGPT_MDSettings): Record<string, any> | undefined {
    if (!settings.enableToolCalling) {
      return undefined;
    }

    const enabledTools: Record<string, any> = {};

    // Vault tools
    enabledTools.vault_search = this.tools.get("vault_search");
    enabledTools.file_read = this.tools.get("file_read");

    // Web search tool (check setting)
    if (settings.enableWebSearch) {
      enabledTools.web_search = this.tools.get("web_search");
    }

    return Object.keys(enabledTools).length > 0 ? enabledTools : undefined;
  }

  // ========== Vault Operations (from VaultTools) ==========

  /**
   * Search vault for files matching query (searches filename and content)
   * Supports multi-word queries - matches files containing ANY of the words (OR search)
   */
  async searchVault(
    args: { query: string; limit?: number },
    context: ToolExecutionContext
  ): Promise<VaultSearchResult[]> {
    const { query, limit = 10 } = args;
    const lowerQuery = query.toLowerCase();

    // Split query into individual words for OR search
    const queryWords = lowerQuery.split(/\s+/).filter((word) => word.length > 0);

    const results: VaultSearchResult[] = [];

    // Get all markdown files
    const files = this.app.vault.getMarkdownFiles();

    // Get the current file path to exclude it from search
    const currentFile = this.app.workspace.getActiveFile();
    const currentFilePath = currentFile?.path;

    for (const file of files) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        break;
      }

      // Skip current file
      if (currentFilePath && file.path === currentFilePath) {
        continue;
      }

      const lowerBasename = file.basename.toLowerCase();

      // Check if filename matches any query word
      let filenameMatch = false;
      for (const word of queryWords) {
        if (lowerBasename.includes(word)) {
          filenameMatch = true;
          break;
        }
      }

      if (filenameMatch) {
        results.push({
          path: file.path,
          basename: file.basename,
          matches: 1,
        });
      } else {
        // Check if file content matches any query word
        const content = await this.app.vault.read(file);
        const lowerContent = content.toLowerCase();

        for (const word of queryWords) {
          if (lowerContent.includes(word)) {
            results.push({
              path: file.path,
              basename: file.basename,
              matches: 1,
            });
            break;
          }
        }
      }

      // Stop if we have enough results
      if (results.length >= Math.min(limit, 50)) {
        break;
      }
    }

    console.log(`[ChatGPT MD] Vault search: "${query}" found ${results.length} results`);
    return results;
  }

  /**
   * Read contents of specified files
   */
  async readFiles(args: { filePaths: string[] }, context: ToolExecutionContext): Promise<FileReadResult[]> {
    const { filePaths } = args;
    const results: FileReadResult[] = [];

    for (const path of filePaths) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        break;
      }

      const file = this.app.vault.getAbstractFileByPath(path);

      if (file instanceof TFile) {
        try {
          const content = await this.app.vault.read(file);
          results.push({
            path: file.path,
            content: content,
            size: file.stat.size,
          });
        } catch (error) {
          console.error(`[ChatGPT MD] Error reading file ${path}:`, error);
          results.push({
            path: path,
            content: `Error reading file: ${error}`,
            size: 0,
          });
        }
      } else {
        results.push({
          path: path,
          content: `File not found: ${path}`,
          size: 0,
        });
      }
    }

    console.log(`[ChatGPT MD] Read ${results.length} files`);
    return results;
  }

  // ========== Web Search Operations (from WebSearchService) ==========

  /**
   * Search using Brave Search API
   * Requires API key (free tier: 1,000 queries/month)
   */
  private async searchBrave(query: string, apiKey: string, limit: number = 5): Promise<WebSearchResult[]> {
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
  private async searchCustom(query: string, apiUrl: string, apiKey?: string, limit: number = 5): Promise<WebSearchResult[]> {
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

  // ========== Tool Orchestration and Approval ==========

  /**
   * Request approval from user for a tool call
   * Merged from ToolExecutor
   */
  private async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    console.log(`[ChatGPT MD] Requesting approval for tool: ${request.toolName}`);

    const modal = new ToolApprovalModal(this.app, request.toolName, request.args, request.modelName);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      this.notificationService.showWarning(`Tool execution cancelled: ${request.toolName}`);
      console.log(`[ChatGPT MD] Tool cancelled by user: ${request.toolName}`);
    } else {
      console.log(`[ChatGPT MD] Tool approved by user: ${request.toolName}`);
    }

    return decision;
  }

  /**
   * Set the approval handler for tool calls
   */
  setApprovalHandler(handler: (toolName: string, args: any) => Promise<any>): void {
    this.approvalHandler = handler;
  }

  /**
   * Get tools to pass to AI SDK based on settings
   */
  getToolsForRequest(settings: ChatGPT_MDSettings): Record<string, any> | undefined {
    return this.getEnabledTools(settings);
  }

  /**
   * Request user approval for search results before showing to LLM
   */
  async requestSearchResultsApproval(
    query: string,
    results: VaultSearchResult[],
    modelName?: string
  ): Promise<VaultSearchResult[]> {
    console.log(`[ChatGPT MD] Requesting approval for search results: "${query}" (${results.length} results)`);

    const modal = new SearchResultsApprovalModal(this.app, query, results, modelName);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      console.log(`[ChatGPT MD] Search results approval cancelled by user`);
      return [];
    }

    console.log(`[ChatGPT MD] User approved ${decision.approvedResults.length} of ${results.length} search results`);
    return decision.approvedResults;
  }

  /**
   * Request user approval for web search results before sharing with LLM
   */
  async requestWebSearchResultsApproval(
    query: string,
    results: WebSearchResult[],
    modelName?: string
  ): Promise<WebSearchResult[]> {
    console.log(`[ChatGPT MD] Requesting approval for web search results: "${query}" (${results.length} results)`);

    const modal = new WebSearchApprovalModal(this.app, query, results, modelName);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      console.log(`[ChatGPT MD] Web search results approval cancelled by user`);
      return [];
    }

    console.log(`[ChatGPT MD] User approved ${decision.approvedResults.length} of ${results.length} web search results`);
    return decision.approvedResults;
  }

  /**
   * Read file contents for approved vault_search results
   */
  async readFilesFromSearchResults(
    searchResults: VaultSearchResult[]
  ): Promise<Array<{ path: string; content: string }>> {
    const fileContents: Array<{ path: string; content: string }> = [];

    for (const searchResult of searchResults) {
      try {
        // Extract actual file path from markdown link format if needed
        // vault_search returns paths as markdown links like "[basename](path)"
        let actualPath = searchResult.path;
        const markdownMatch = actualPath.match(/\]\((.*?)\)$/);
        if (markdownMatch) {
          actualPath = markdownMatch[1];
        }

        const file = this.app.vault.getAbstractFileByPath(actualPath);

        if (file instanceof TFile) {
          const content = await this.app.vault.read(file);
          fileContents.push({
            path: actualPath,
            content: content,
          });
        }
      } catch (error) {
        console.error(`[ChatGPT MD] Error reading file ${searchResult.path}:`, error);
      }
    }
    return fileContents;
  }

  /**
   * Handle vault_search tool results
   */
  private async handleVaultSearchResult(
    toolResult: any,
    toolCall: any,
    filteredResults: any[],
    contextMessages: Array<{ role: "user"; content: string }>,
    modelName?: string
  ): Promise<void> {
    const result = toolResult.result;

    if (!Array.isArray(result)) {
      filteredResults.push(toolResult);
      return;
    }

    const query = (toolCall?.input as any)?.query || "unknown";

    if (result.length > 0) {
      const approvedResults = await this.requestSearchResultsApproval(query, result, modelName);
      filteredResults.push({ ...toolResult, result: approvedResults });

      if (approvedResults.length > 0) {
        // Read file contents for approved results
        const fileContents = await this.readFilesFromSearchResults(approvedResults);
        for (const fc of fileContents) {
          contextMessages.push({
            role: "user",
            content: `[vault_search result]\n\nFile: ${fc.path}\n\n${fc.content}`,
          });
        }
      } else {
        contextMessages.push({
          role: "user",
          content: `[vault_search result - no files found]\n\nThe search for "${query}" returned no results. Try searching with different keywords or single words.`,
        });
      }
    } else {
      // Empty results
      filteredResults.push(toolResult);
      contextMessages.push({
        role: "user",
        content: `[vault_search result - no files found]\n\nThe search for "${query}" returned no results. Try searching with different keywords or single words.`,
      });
    }
  }

  /**
   * Handle file_read tool results
   */
  private async handleFileReadResult(
    toolResult: any,
    toolCall: any,
    filteredResults: any[],
    contextMessages: Array<{ role: "user"; content: string }>,
    modelName?: string
  ): Promise<void> {
    const result = toolResult.result;

    if (!Array.isArray(result) || result.length === 0) {
      return;
    }

    filteredResults.push(toolResult);
    for (const fileResult of result) {
      if (fileResult.content && typeof fileResult.content === "string") {
        contextMessages.push({
          role: "user",
          content: `[file_read result]\n\nFile: ${fileResult.path}\n\n${fileResult.content}`,
        });
      }
    }
  }

  /**
   * Handle web_search tool results
   */
  private async handleWebSearchResult(
    toolResult: any,
    toolCall: any,
    filteredResults: any[],
    contextMessages: Array<{ role: "user"; content: string }>,
    modelName?: string
  ): Promise<void> {
    const result = toolResult.result;

    if (!Array.isArray(result)) {
      filteredResults.push(toolResult);
      return;
    }

    const query = (toolCall?.input as any)?.query || "unknown";

    if (result.length > 0) {
      const approvedResults = await this.requestWebSearchResultsApproval(query, result, modelName);
      filteredResults.push({ ...toolResult, result: approvedResults });

      if (approvedResults.length > 0) {
        // Format approved results as context messages
        for (const webResult of approvedResults) {
          contextMessages.push({
            role: "user",
            content: `[web_search result]\n\nTitle: ${webResult.title}\nURL: ${webResult.url}\n\n${webResult.content || webResult.snippet}`,
          });
        }
      } else {
        contextMessages.push({
          role: "user",
          content: `[web_search result - no results selected]\n\nThe web search for "${query}" returned results, but none were approved for sharing.`,
        });
      }
    } else {
      // Empty results
      filteredResults.push(toolResult);
      contextMessages.push({
        role: "user",
        content: `[web_search result - no results found]\n\nThe web search for "${query}" returned no results. Try different search terms.`,
      });
    }
  }

  /**
   * Process tool call results: filter, approve, and convert to context messages
   */
  async processToolResults(
    toolCalls: any[],
    toolResults: any[],
    modelName?: string
  ): Promise<{
    filteredResults: any[];
    contextMessages: Array<{ role: "user"; content: string }>;
  }> {
    const contextMessages: Array<{ role: "user"; content: string }> = [];
    const filteredResults: any[] = [];

    for (const toolResult of toolResults) {
      const toolCall = toolCalls.find((tc: any) => {
        const tcId = tc.toolCallId || tc.id || "unknown";
        return tcId === toolResult.toolCallId;
      });

      const toolName = toolCall?.toolName;
      const handler = this.toolResultHandlers[toolName];

      if (handler) {
        await handler(toolResult, toolCall, filteredResults, contextMessages, modelName);
      } else {
        // Unknown tool - pass through as-is
        filteredResults.push(toolResult);
      }
    }

    return { filteredResults, contextMessages };
  }

  /**
   * Handle tool calls by requesting user approval and executing if approved
   */
  async handleToolCalls(toolCalls: any[], modelName?: string): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      // Extract tool info - handle different possible structures
      const toolName = toolCall.toolName || toolCall.name || toolCall.tool;
      const toolArgs = toolCall.args || toolCall.input || toolCall.arguments || {};
      const toolCallId = toolCall.toolCallId || toolCall.id || "unknown";

      // Request user approval for this tool call
      const approved = await this.requestApproval({
        toolCallId: toolCallId,
        toolName: toolName,
        args: toolArgs,
        modelName: modelName,
      });

      if (!approved.approved) {
        results.push({
          toolCallId: toolCallId,
          result: { error: "User declined tool execution" },
        });
        continue;
      }

      // Execute the tool with approved arguments
      try {
        const tool = this.getTool(toolName);
        if (!tool || !tool.execute) {
          results.push({
            toolCallId: toolCallId,
            result: { error: "Tool not found or has no execute function" },
          });
          continue;
        }

        // Use modified args if provided (e.g., filtered file list from approval modal)
        const argsToUse = approved.modifiedArgs || toolArgs;

        const result = await tool.execute(argsToUse, {
          app: this.app,
          toolCallId: toolCallId,
          messages: [],
        });
        results.push({
          toolCallId: toolCallId,
          result: result,
        });
      } catch (error) {
        results.push({
          toolCallId: toolCallId,
          result: { error: `Tool execution failed: ${error}` },
        });
      }
    }

    return results;
  }
}
