import { App } from "obsidian";
import { ToolRegistry } from "./ToolRegistry";
import { ToolExecutor } from "./ToolExecutor";
import { ToolExecutionContext, ToolApprovalRequest } from "src/Models/Tool";
import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Service for orchestrating tool calling with AI SDK
 */
export class ToolService {
  constructor(
    private app: App,
    private toolRegistry: ToolRegistry,
    private toolExecutor: ToolExecutor
  ) {}

  /**
   * Get tools to pass to AI SDK based on settings
   */
  getToolsForRequest(settings: ChatGPT_MDSettings): Record<string, any> | undefined {
    return this.toolRegistry.getEnabledTools(settings);
  }

  /**
   * Handle tool approval requests from AI SDK
   */
  async handleToolApprovalRequests(
    toolCalls: any[],
    context: ToolExecutionContext
  ): Promise<any[]> {
    console.log(`[ChatGPT MD] Handling ${toolCalls.length} tool call(s)`);

    const toolResults = [];

    for (const toolCall of toolCalls) {
      const request: ToolApprovalRequest = {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        args: toolCall.args,
      };

      // Execute with approval
      const result = await this.toolExecutor.executeWithApproval(request, context);

      toolResults.push({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: result,
      });
    }

    return toolResults;
  }
}
