import { App, TFile } from "obsidian";
import { ToolRegistry } from "./ToolRegistry";
import { ToolExecutor } from "./ToolExecutor";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { SearchResultsApprovalModal } from "src/Views/SearchResultsApprovalModal";
import { VaultSearchResult } from "src/Models/Tool";

/**
 * Service for orchestrating tool calling with AI SDK
 * Handles manual human-in-the-loop approval for tool calls
 */
export class ToolService {
  private approvalHandler?: (toolName: string, args: any) => Promise<any>;

  constructor(
    private app: App,
    private toolRegistry: ToolRegistry,
    private toolExecutor: ToolExecutor
  ) {}

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
  async requestSearchResultsApproval(query: string, results: VaultSearchResult[]): Promise<VaultSearchResult[]> {
    console.log(`[ChatGPT MD] Requesting approval for search results: "${query}" (${results.length} results)`);

    const modal = new SearchResultsApprovalModal(this.app, query, results);
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
   * Read file contents for approved vault_search results
   */
  async readFilesFromSearchResults(
    searchResults: VaultSearchResult[]
  ): Promise<Array<{ path: string; content: string }>> {
    const fileContents: Array<{ path: string; content: string }> = [];

    console.log(`[ChatGPT MD] readFilesFromSearchResults called with ${searchResults.length} results`);

    for (const searchResult of searchResults) {
      try {
        // Extract actual file path from markdown link format if needed
        // vault_search returns paths as markdown links like "[basename](path)"
        let actualPath = searchResult.path;
        const markdownMatch = actualPath.match(/\]\((.*?)\)$/);
        if (markdownMatch) {
          actualPath = markdownMatch[1];
          console.log(`[ChatGPT MD] Extracted actual path from markdown link: ${actualPath}`);
        }

        console.log(`[ChatGPT MD] Attempting to read file: ${actualPath}`);
        const file = this.app.vault.getAbstractFileByPath(actualPath);
        console.log(`[ChatGPT MD] getAbstractFileByPath returned:`, file);

        if (file instanceof TFile) {
          console.log(`[ChatGPT MD] File is TFile, reading content...`);
          const content = await this.app.vault.read(file);
          console.log(`[ChatGPT MD] Successfully read ${content.length} characters from ${actualPath}`);
          fileContents.push({
            path: actualPath,
            content: content,
          });
        } else {
          console.log(
            `[ChatGPT MD] File is not TFile instance. Type: ${typeof file}, Constructor: ${file?.constructor?.name}`
          );
        }
      } catch (error) {
        console.error(`[ChatGPT MD] Error reading file ${searchResult.path}:`, error);
      }
    }

    console.log(`[ChatGPT MD] readFilesFromSearchResults completed: read ${fileContents.length} files`);
    return fileContents;
  }

  /**
   * Handle tool calls by requesting user approval and executing if approved
   */
  async handleToolCalls(toolCalls: any[]): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      console.log("[ChatGPT MD] Tool call structure:", JSON.stringify(toolCall, null, 2));

      // Extract tool info - handle different possible structures
      const toolName = toolCall.toolName || toolCall.name || toolCall.tool;
      const toolArgs = toolCall.args || toolCall.input || toolCall.arguments || {};
      const toolCallId = toolCall.toolCallId || toolCall.id || "unknown";

      // Request user approval for this tool call
      const approved = await this.toolExecutor.requestApproval({
        toolCallId: toolCallId,
        toolName: toolName,
        args: toolArgs,
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
        console.log(`[ChatGPT MD] Tool "${toolName}" executing with args:`, JSON.stringify(argsToUse, null, 2));

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
