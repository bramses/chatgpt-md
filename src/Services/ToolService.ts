import { App, TFile } from "obsidian";
import { Logger } from "src/Utilities/Logger";
import { toErrorMessage } from "src/Utilities/AiErrorFormatter";

import { FileService } from "./FileService";
import { NotificationService } from "./NotificationService";
import { VaultSearchService } from "./VaultSearchService";
import { WebSearchService } from "./WebSearchService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import {
  AiToolCall,
  RegisteredTool,
  ToolApprovalDecision,
  ToolExecutionResult,
  ToolApprovalRequest,
  ToolResultHandler,
  VaultSearchResult,
  WebSearchResult,
} from "src/Models/Tool";
import { createDefaultTools } from "./Tools/defaultTools";
import { ToolApprovalCoordinator, ToolApprovalGateway } from "./Tools/ToolApprovalCoordinator";
import { ApiAuthService } from "./ApiAuthService";
import {
  fileReadContext,
  noVaultResultsContext,
  noWebResultsContext,
  vaultFileContext,
  webResultContext,
} from "./Tools/ToolResultFormatter";

/**
 * Unified Tool Service
 * Handles all tool-related functionality:
 * - Tool registration and retrieval
 * - Vault operations (delegates to VaultSearchService)
 * - Web search (delegates to WebSearchService)
 * - Tool orchestration and approval
 */
export class ToolService {
  private readonly toolResultHandlers: Record<string, ToolResultHandler>;
  private readonly tools: Map<string, RegisteredTool> = new Map();
  private readonly vaultSearchService: VaultSearchService;
  private readonly webSearchService: WebSearchService;
  private readonly approvalGateway: ToolApprovalGateway;

  constructor(
    private app: App,
    private fileService: FileService,
    private notificationService: NotificationService,
    private settingsService: ChatGPT_MDSettings,
    vaultSearchService?: VaultSearchService,
    webSearchService?: WebSearchService,
    approvalGateway?: ToolApprovalGateway,
    private readonly apiAuthService: ApiAuthService = new ApiAuthService()
  ) {
    this.toolResultHandlers = {
      vault_search: this.handleVaultSearchResult.bind(this),
      file_read: this.handleFileReadResult.bind(this),
      web_search: this.handleWebSearchResult.bind(this),
    };

    this.vaultSearchService = vaultSearchService || new VaultSearchService(app, fileService);
    this.webSearchService = webSearchService || new WebSearchService(notificationService);
    this.approvalGateway = approvalGateway || new ToolApprovalCoordinator(app);

    // Register default tools
    this.registerDefaultTools();
  }

  // ========== Tool Registration (from ToolRegistry) ==========

  /**
   * Register default tools with manual human-in-the-loop approval
   */
  private registerDefaultTools(): void {
    createDefaultTools({
      app: this.app,
      settings: this.settingsService,
      vaultSearchService: this.vaultSearchService,
      webSearchService: this.webSearchService,
      resolveWebSearchCredential: () => this.apiAuthService.resolveWebSearchCredential(this.settingsService),
    }).forEach((toolDefinition, name) => this.registerTool(name, toolDefinition));
  }

  /**
   * Register a new tool
   */
  registerTool(name: string, toolDef: RegisteredTool): void {
    this.tools.set(name, toolDef);
  }

  /**
   * Check if web search tool is available based on settings
   * - Brave provider: requires API key
   * - Custom provider: requires API URL
   *
   * @param settings - Plugin settings containing web search configuration
   * @returns true if web search is properly configured, false otherwise
   */
  private isWebSearchAvailable(settings: ChatGPT_MDSettings): boolean {
    if (settings.webSearchProvider === "parallel") return true;
    if (settings.webSearchProvider === "brave") {
      return this.apiAuthService.resolveWebSearchCredential(settings).length > 0;
    }
    if (settings.webSearchProvider === "custom") {
      return !!settings.webSearchApiUrl && settings.webSearchApiUrl.trim().length > 0;
    }
    return false;
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Record<string, RegisteredTool> {
    const toolsObject: Record<string, RegisteredTool> = {};
    this.tools.forEach((toolDef, name) => {
      toolsObject[name] = toolDef;
    });
    return toolsObject;
  }

  /**
   * Get tools enabled for a request based on settings
   * Filters tools based on configuration requirements:
   * - vault_search/file_read: always available if tool calling enabled
   * - web_search: only if API key/URL configured
   *
   * @param settings - Plugin settings containing tool and web search configuration
   * @returns Object containing enabled tools, or undefined if no tools available
   */
  getEnabledTools(settings: ChatGPT_MDSettings): Record<string, Omit<RegisteredTool, "execute">> | undefined {
    if (!settings.enableToolCalling) {
      return undefined;
    }

    const allTools = this.getAllTools();
    const enabledTools: Record<string, Omit<RegisteredTool, "execute">> = {};

    // Only expose tool declarations to AI SDK. Registered executors stay in
    // this service and run after the plugin's explicit approval flow. Passing
    // `execute` to AI SDK would execute the tool immediately when the model
    // requests it, before the user has approved access.
    if (allTools.vault_search) {
      enabledTools.vault_search = this.toAiSdkToolDeclaration(allTools.vault_search);
    }
    if (allTools.file_read) {
      enabledTools.file_read = this.toAiSdkToolDeclaration(allTools.file_read);
    }

    // Web search - only if properly configured
    if (allTools.web_search && this.isWebSearchAvailable(settings)) {
      enabledTools.web_search = this.toAiSdkToolDeclaration(allTools.web_search);
    }

    // Return undefined if no tools are enabled (prevents passing empty object to AI SDK)
    return Object.keys(enabledTools).length > 0 ? enabledTools : undefined;
  }

  private toAiSdkToolDeclaration(toolDefinition: RegisteredTool): Omit<RegisteredTool, "execute"> {
    const declaration: Partial<RegisteredTool> = { ...toolDefinition };
    delete declaration.execute;
    return declaration as Omit<RegisteredTool, "execute">;
  }

  // ========== Tool Orchestration and Approval ==========

  /**
   * Request approval from user for a tool call
   * Merged from ToolExecutor
   */
  private async requestApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    const decision = await this.approvalGateway.approveTool(request);

    if (!decision.approved) {
      this.notificationService.showWarning(`Tool execution cancelled: ${request.toolName}`);
    }

    return decision;
  }

  /**
   * Get tools to pass to AI SDK based on settings
   */
  getToolsForRequest(settings: ChatGPT_MDSettings): Record<string, Omit<RegisteredTool, "execute">> | undefined {
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
    const decision = await this.approvalGateway.approveVaultResults(query, results, modelName);

    if (!decision.approved) {
      return [];
    }
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
    const decision = await this.approvalGateway.approveWebResults(query, results, modelName);

    if (!decision.approved) {
      return [];
    }
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
        Logger.error(`[ChatGPT MD] Error reading file ${searchResult.path}`, { error });
      }
    }
    return fileContents;
  }

  /**
   * Handle vault_search tool results
   */
  private async handleVaultSearchResult(
    toolResult: ToolExecutionResult,
    toolCall: AiToolCall,
    filteredResults: ToolExecutionResult[],
    contextMessages: Array<{ role: "user"; content: string }>,
    modelName?: string
  ): Promise<void> {
    const result = toolResult.result;

    if (!Array.isArray(result)) {
      filteredResults.push(toolResult);
      return;
    }

    const query = typeof toolCall.args.query === "string" ? toolCall.args.query : "unknown";

    if (result.length > 0) {
      const approvedResults = await this.requestSearchResultsApproval(query, result, modelName);
      filteredResults.push({ ...toolResult, result: approvedResults });

      if (approvedResults.length > 0) {
        // Read file contents for approved results
        const fileContents = await this.readFilesFromSearchResults(approvedResults);
        for (const fc of fileContents) {
          contextMessages.push(vaultFileContext(fc.path, fc.content));
        }
      } else {
        contextMessages.push(noVaultResultsContext(query));
      }
    } else {
      // Empty results
      filteredResults.push(toolResult);
      contextMessages.push(noVaultResultsContext(query));
    }
  }

  /**
   * Handle file_read tool results
   */
  private async handleFileReadResult(
    toolResult: ToolExecutionResult,
    toolCall: AiToolCall,
    filteredResults: ToolExecutionResult[],
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
        contextMessages.push(fileReadContext(String(fileResult.path || "unknown"), fileResult.content));
      }
    }
  }

  /**
   * Handle web_search tool results
   */
  private async handleWebSearchResult(
    toolResult: ToolExecutionResult,
    toolCall: AiToolCall,
    filteredResults: ToolExecutionResult[],
    contextMessages: Array<{ role: "user"; content: string }>,
    modelName?: string
  ): Promise<void> {
    const result = toolResult.result;

    if (!Array.isArray(result)) {
      filteredResults.push(toolResult);
      return;
    }

    const query = typeof toolCall.args.query === "string" ? toolCall.args.query : "unknown";

    if (result.length > 0) {
      const approvedResults = await this.requestWebSearchResultsApproval(query, result, modelName);
      filteredResults.push({ ...toolResult, result: approvedResults });

      if (approvedResults.length > 0) {
        // Format approved results as context messages
        for (const webResult of approvedResults) {
          contextMessages.push(webResultContext(webResult));
        }
      } else {
        contextMessages.push(noWebResultsContext(query, true));
      }
    } else {
      // Empty results
      filteredResults.push(toolResult);
      contextMessages.push(noWebResultsContext(query, false));
    }
  }

  /**
   * Process tool call results: filter, approve, and convert to context messages
   */
  async processToolResults(
    toolCalls: unknown[],
    toolResults: ToolExecutionResult[],
    modelName?: string
  ): Promise<{
    filteredResults: ToolExecutionResult[];
    contextMessages: Array<{ role: "user"; content: string }>;
  }> {
    const contextMessages: Array<{ role: "user"; content: string }> = [];
    const filteredResults: ToolExecutionResult[] = [];
    const normalizedCalls = toolCalls
      .map((toolCall) => this.normalizeToolCall(toolCall))
      .filter(Boolean) as AiToolCall[];

    for (const toolResult of toolResults) {
      const toolCall = normalizedCalls.find((call) => call.toolCallId === toolResult.toolCallId);
      if (!toolCall) {
        filteredResults.push(toolResult);
        continue;
      }

      const handler = this.toolResultHandlers[toolCall.toolName];

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
  async handleToolCalls(toolCalls: unknown[], modelName?: string): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    for (const toolCall of toolCalls) {
      results.push(await this.executeToolCall(toolCall, modelName));
    }
    return results;
  }

  /**
   * Execute a single tool call with approval
   */
  private async executeToolCall(toolCall: unknown, modelName?: string): Promise<ToolExecutionResult> {
    const normalizedCall = this.normalizeToolCall(toolCall);
    if (!normalizedCall) {
      return { toolCallId: "unknown", result: { error: "Invalid tool call" } };
    }

    const { toolName, args, toolCallId } = normalizedCall;
    const tool = this.getTool(toolName);
    const parsedArgs = tool?.inputSchema.safeParse(args);
    if (!tool || !parsedArgs?.success) {
      return { toolCallId, result: { error: "Tool not found or invalid arguments" } };
    }

    const validatedArgs = parsedArgs.data as Record<string, unknown>;
    const approval = await this.requestApproval({
      toolCallId,
      toolName,
      args: validatedArgs,
      modelName,
    });

    if (!approval.approved) {
      return {
        toolCallId,
        result: { error: "User declined tool execution" },
      };
    }

    return this.executeTool(toolName, approval.modifiedArgs || validatedArgs, toolCallId);
  }

  /**
   * Normalize different tool call structures
   */
  private normalizeToolCall(toolCall: unknown): AiToolCall | null {
    if (!toolCall || typeof toolCall !== "object") return null;

    const raw = toolCall as Record<string, unknown>;
    const toolName = [raw.toolName, raw.name, raw.tool].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );
    const rawArgs = raw.args ?? raw.input ?? raw.arguments ?? {};
    const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : null;
    const rawCallId = raw.toolCallId ?? raw.id;

    if (!toolName || !args) return null;
    return {
      toolName,
      args: args as Record<string, unknown>,
      toolCallId: typeof rawCallId === "string" && rawCallId ? rawCallId : "unknown",
    };
  }

  /**
   * Execute tool and return result
   */
  private async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId: string
  ): Promise<ToolExecutionResult> {
    try {
      const tool = this.getTool(toolName);
      if (!tool) return { toolCallId, result: { error: "Tool not found" } };
      const parsedArgs = tool.inputSchema.safeParse(args);
      if (!parsedArgs.success) return { toolCallId, result: { error: "Invalid tool arguments" } };

      const result = await tool.execute(parsedArgs.data as Record<string, unknown>, {
        app: this.app,
        toolCallId,
        messages: [],
      });

      return { toolCallId, result };
    } catch (error) {
      return {
        toolCallId,
        result: { error: `Tool execution failed: ${toErrorMessage(error)}` },
      };
    }
  }
}
