import { App } from "obsidian";
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
  async requestSearchResultsApproval(
    query: string,
    results: VaultSearchResult[]
  ): Promise<VaultSearchResult[]> {
    console.log(`[ChatGPT MD] Requesting approval for search results: "${query}" (${results.length} results)`);

    const modal = new SearchResultsApprovalModal(this.app, query, results);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      console.log(`[ChatGPT MD] Search results approval cancelled by user`);
      return [];
    }

    console.log(
      `[ChatGPT MD] User approved ${decision.approvedResults.length} of ${results.length} search results`
    );
    return decision.approvedResults;
  }

  /**
   * Handle tool calls by requesting user approval and executing if approved
   */
  async handleToolCalls(toolCalls: any[]): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
      console.log('[ChatGPT MD] Tool call structure:', JSON.stringify(toolCall, null, 2));

      // Extract tool info - handle different possible structures
      const toolName = toolCall.toolName || toolCall.name || toolCall.tool;
      const toolArgs = toolCall.args || toolCall.input || toolCall.arguments || {};
      const toolCallId = toolCall.toolCallId || toolCall.id || 'unknown';

      // Request user approval for this tool call
      const approved = await this.toolExecutor.requestApproval({
        toolCallId: toolCallId,
        toolName: toolName,
        args: toolArgs,
      });

      if (!approved.approved) {
        results.push({
          toolCallId: toolCallId,
          result: { error: 'User declined tool execution' },
        });
        continue;
      }

      // Execute the tool with approved arguments
      try {
        const tool = this.toolRegistry.getTool(toolName);
        if (!tool || !tool.execute) {
          results.push({
            toolCallId: toolCallId,
            result: { error: 'Tool not found or has no execute function' },
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
