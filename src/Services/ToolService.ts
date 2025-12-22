import { App, TFile } from "obsidian";
import { ToolRegistry } from "./ToolRegistry";
import { ToolExecutor } from "./ToolExecutor";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { SearchResultsApprovalModal } from "src/Views/SearchResultsApprovalModal";
import { WebSearchApprovalModal } from "src/Views/WebSearchApprovalModal";
import { VaultSearchResult, WebSearchResult } from "src/Models/Tool";
import { Logger } from "src/Utilities/Logger";

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
 * Service for orchestrating tool calling with AI SDK
 * Handles manual human-in-the-loop approval for tool calls
 */
export class ToolService {
  private approvalHandler?: (toolName: string, args: any) => Promise<any>;
  private readonly toolResultHandlers: Record<string, ToolResultHandler>;

  constructor(
    private app: App,
    private toolRegistry: ToolRegistry,
    private toolExecutor: ToolExecutor
  ) {
    this.toolResultHandlers = {
      vault_search: this.handleVaultSearchResult.bind(this),
      file_read: this.handleFileReadResult.bind(this),
      web_search: this.handleWebSearchResult.bind(this),
    };
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
    return this.toolRegistry.getEnabledTools(settings);
  }

  /**
   * Request user approval for search results before showing to LLM
   */
  async requestSearchResultsApproval(
    query: string,
    results: VaultSearchResult[],
    modelName?: string
  ): Promise<VaultSearchResult[]> {
    Logger.debug(`Requesting approval for search results: "${query}" (${results.length} results)`);

    const modal = new SearchResultsApprovalModal(this.app, query, results, modelName);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      Logger.debug(`Search results approval cancelled by user`);
      return [];
    }

    Logger.debug(`User approved ${decision.approvedResults.length} of ${results.length} search results`);
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
    Logger.debug(`Requesting approval for web search results: "${query}" (${results.length} results)`);

    const modal = new WebSearchApprovalModal(this.app, query, results, modelName);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      Logger.debug(`Web search results approval cancelled by user`);
      return [];
    }

    Logger.debug(`User approved ${decision.approvedResults.length} of ${results.length} web search results`);
    return decision.approvedResults;
  }

  /**
   * Read file contents for approved vault_search results
   */
  async readFilesFromSearchResults(
    searchResults: VaultSearchResult[]
  ): Promise<Array<{ path: string; content: string }>> {
    const fileContents: Array<{ path: string; content: string }> = [];

    Logger.debug(`readFilesFromSearchResults called with ${searchResults.length} results`);

    for (const searchResult of searchResults) {
      try {
        // Extract actual file path from markdown link format if needed
        // vault_search returns paths as markdown links like "[basename](path)"
        let actualPath = searchResult.path;
        const markdownMatch = actualPath.match(/\]\((.*?)\)$/);
        if (markdownMatch) {
          actualPath = markdownMatch[1];
          Logger.debug(`Extracted actual path from markdown link: ${actualPath}`);
        }

        Logger.debug(`Attempting to read file: ${actualPath}`);
        const file = this.app.vault.getAbstractFileByPath(actualPath);
        Logger.debug(`getAbstractFileByPath returned:`, file);

        if (file instanceof TFile) {
          Logger.debug(`File is TFile, reading content...`);
          const content = await this.app.vault.read(file);
          Logger.debug(`Successfully read ${content.length} characters from ${actualPath}`);
          fileContents.push({
            path: actualPath,
            content: content,
          });
        } else {
          Logger.debug(`File is not TFile instance. Type: ${typeof file}, Constructor: ${file?.constructor?.name}`);
        }
      } catch (error) {
        Logger.error(`Error reading file ${searchResult.path}:`, error);
      }
    }

    Logger.debug(`readFilesFromSearchResults completed: read ${fileContents.length} files`);
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
      Logger.debug("Tool call structure:", JSON.stringify(toolCall, null, 2));

      // Extract tool info - handle different possible structures
      const toolName = toolCall.toolName || toolCall.name || toolCall.tool;
      const toolArgs = toolCall.args || toolCall.input || toolCall.arguments || {};
      const toolCallId = toolCall.toolCallId || toolCall.id || "unknown";

      // Request user approval for this tool call
      const approved = await this.toolExecutor.requestApproval({
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
        const tool = this.toolRegistry.getTool(toolName);
        if (!tool || !tool.execute) {
          results.push({
            toolCallId: toolCallId,
            result: { error: "Tool not found or has no execute function" },
          });
          continue;
        }

        // Use modified args if provided (e.g., filtered file list from approval modal)
        const argsToUse = approved.modifiedArgs || toolArgs;
        Logger.debug(`Tool "${toolName}" executing with args:`, JSON.stringify(argsToUse, null, 2));

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
