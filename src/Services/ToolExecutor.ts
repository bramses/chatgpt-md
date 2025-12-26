import { App } from "obsidian";
import { ToolRegistry } from "./ToolRegistry";
import { NotificationService } from "./NotificationService";
import { ToolApprovalDecision, ToolApprovalRequest, ToolExecutionContext } from "src/Models/Tool";
import { ToolApprovalModal } from "src/Views/ToolApprovalModal";

/**
 * Service for executing tools with user approval
 */
export class ToolExecutor {
  constructor(
    private app: App,
    private toolRegistry: ToolRegistry,
    private notificationService: NotificationService
  ) {}

  /**
   * Request approval from user for a tool call
   */
  async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
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
   * Execute a tool with user approval
   */
  async executeWithApproval(request: ToolApprovalRequest, context: ToolExecutionContext): Promise<any> {
    // Request approval from user
    const decision = await this.requestApproval(request);

    if (!decision.approved) {
      return { error: "User cancelled tool execution" };
    }

    // Get the tool
    const tool = this.toolRegistry.getTool(request.toolName);

    if (!tool) {
      const errorMsg = `Unknown tool: ${request.toolName}`;
      console.error(`[ChatGPT MD] ${errorMsg}`);
      this.notificationService.showError(errorMsg);
      return { error: errorMsg };
    }

    // Use modified args if provided (e.g., filtered file list)
    const args = decision.modifiedArgs || request.args;

    try {
      // Execute the tool
      console.log(`[ChatGPT MD] Executing tool: ${request.toolName}`, args);
      const result = await tool.execute(args, {
        toolCallId: context.toolCallId,
        messages: context.messages,
        abortSignal: context.abortSignal,
      });

      console.log(`[ChatGPT MD] Tool execution completed: ${request.toolName}`);
      return result;
    } catch (error) {
      const errorMsg = `Tool execution error: ${error}`;
      console.error(`[ChatGPT MD] ${errorMsg}`, error);
      this.notificationService.showError(errorMsg);
      return { error: String(error) };
    }
  }
}
