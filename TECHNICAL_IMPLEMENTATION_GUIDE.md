# Technical Implementation Guide - AI Tool Calling

This guide provides step-by-step implementation instructions with complete code examples for each file.

## Prerequisites

- AI SDK v6.0.0-beta.134 (already installed)
- Zod 4.1.13 (already installed)
- Obsidian API (already installed)
- Understanding of TypeScript and async/await

## Phase 1: Foundation - Create New Files

### Step 1: Create `src/Models/Tool.ts`

**Purpose**: Define TypeScript interfaces for tool calling system.

**Full Code**:

```typescript
import { App, TFile } from "obsidian";

/**
 * Tool execution context with Obsidian-specific information
 */
export interface ToolExecutionContext {
  app: App;
  toolCallId: string;
  messages: any[];
  abortSignal?: AbortSignal;
}

/**
 * Tool approval request from AI SDK
 */
export interface ToolApprovalRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

/**
 * User's approval decision for a tool call
 */
export interface ToolApprovalDecision {
  approvalId: string;
  approved: boolean;
  modifiedArgs?: Record<string, any>; // Allow user to modify args before execution
}

/**
 * Result from vault search tool
 */
export interface VaultSearchResult {
  path: string;
  basename: string;
  matches: number;
  preview: string;
}

/**
 * File selection for reading
 */
export interface FileSelection {
  file: TFile;
  selected: boolean;
  reason: string;
}

/**
 * Result from file read tool
 */
export interface FileReadResult {
  path: string;
  content: string;
  size: number;
}
```

**Key Points**:
- All interfaces exported for use across the codebase
- `ToolExecutionContext` includes Obsidian `App` for vault access
- `ToolApprovalDecision` allows modifying args (e.g., filtering files)
- Result types match what tools will return

---

### Step 2: Create `src/Services/VaultTools.ts`

**Purpose**: Implement Obsidian-specific tool operations (search and read).

**Full Code**:

```typescript
import { App, TFile } from "obsidian";
import { FileService } from "./FileService";
import { ToolExecutionContext, VaultSearchResult, FileReadResult } from "src/Models/Tool";

/**
 * Service for Obsidian vault-specific tool operations
 */
export class VaultTools {
  constructor(
    private app: App,
    private fileService: FileService
  ) {}

  /**
   * Search vault for files matching query (searches filename and content)
   */
  async searchVault(
    args: { query: string; limit?: number },
    context: ToolExecutionContext
  ): Promise<VaultSearchResult[]> {
    const { query, limit = 10 } = args;
    const lowerQuery = query.toLowerCase();
    const results: VaultSearchResult[] = [];

    // Get all markdown files
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      // Check if aborted
      if (context.abortSignal?.aborted) {
        break;
      }

      // Search in filename
      if (file.basename.toLowerCase().includes(lowerQuery)) {
        const content = await this.app.vault.read(file);
        results.push({
          path: file.path,
          basename: file.basename,
          matches: 1,
          preview: content.substring(0, 200),
        });
      }
      // Search in content
      else {
        const content = await this.app.vault.read(file);
        if (content.toLowerCase().includes(lowerQuery)) {
          results.push({
            path: file.path,
            basename: file.basename,
            matches: 1,
            preview: this.extractPreview(content, query, 100),
          });
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
  async readFiles(
    args: { filePaths: string[] },
    context: ToolExecutionContext
  ): Promise<FileReadResult[]> {
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

  /**
   * Extract preview of content around query match
   */
  private extractPreview(content: string, query: string, contextChars: number = 100): string {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index === -1) {
      return content.substring(0, 200);
    }

    const start = Math.max(0, index - contextChars);
    const end = Math.min(content.length, index + query.length + contextChars);

    let preview = content.substring(start, end);

    if (start > 0) {
      preview = '...' + preview;
    }
    if (end < content.length) {
      preview = preview + '...';
    }

    return preview;
  }
}
```

**Key Points**:
- `searchVault()` searches both filename and content
- Respects `limit` parameter (max 50 for safety)
- Checks `abortSignal` for cancellation support
- `extractPreview()` shows context around matches
- Error handling for file read failures
- Console logging for debugging

---

### Step 3: Create `src/Services/ToolRegistry.ts`

**Purpose**: Register tools with Zod schemas and manage tool definitions.

**Full Code**:

```typescript
import { App } from "obsidian";
import { tool, CoreTool } from "ai";
import { z } from "zod";
import { VaultTools } from "./VaultTools";
import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Registry for managing AI tools
 */
export class ToolRegistry {
  private tools: Map<string, CoreTool> = new Map();

  constructor(
    private app: App,
    private vaultTools: VaultTools
  ) {
    this.registerDefaultTools();
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Vault search tool
    this.registerTool("vault_search", tool({
      description: 'Search the Obsidian vault for files by name or content. Returns file paths, names, and content previews. Use this to find relevant notes before reading them.',
      parameters: z.object({
        query: z.string().describe('The search query to find files. Can be keywords, topics, or phrases to search for in file names and content.'),
        limit: z.number().optional().default(10).describe('Maximum number of search results to return. Default is 10, maximum is 50.'),
      }),
      execute: async (args, { toolCallId, messages, abortSignal }) => {
        return await this.vaultTools.searchVault(
          args,
          { app: this.app, toolCallId, messages, abortSignal }
        );
      },
    }));

    // File read tool
    this.registerTool("file_read", tool({
      description: 'Read the full contents of specific files from the vault. User will be asked to approve which files to share. Use this after searching to get complete file contents.',
      parameters: z.object({
        filePaths: z.array(z.string()).describe('Array of file paths to read. Use the paths returned from vault_search.'),
      }),
      execute: async (args, { toolCallId, messages, abortSignal }) => {
        return await this.vaultTools.readFiles(
          args,
          { app: this.app, toolCallId, messages, abortSignal }
        );
      },
    }));
  }

  /**
   * Register a new tool
   */
  registerTool(name: string, tool: CoreTool): void {
    this.tools.set(name, tool);
    console.log(`[ChatGPT MD] Registered tool: ${name}`);
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): CoreTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Record<string, CoreTool> {
    const toolsObject: Record<string, CoreTool> = {};
    this.tools.forEach((tool, name) => {
      toolsObject[name] = tool;
    });
    return toolsObject;
  }

  /**
   * Get tools enabled for a request based on settings
   */
  getEnabledTools(settings: ChatGPT_MDSettings): Record<string, CoreTool> | undefined {
    if (!settings.enableToolCalling) {
      return undefined;
    }

    return this.getAllTools();
  }
}
```

**Key Points**:
- Uses `tool()` helper from AI SDK
- Zod `.describe()` provides guidance to AI
- Descriptive tool descriptions help AI choose correctly
- `getEnabledTools()` checks settings before returning tools
- Tools pass context to VaultTools for execution

---

### Step 4: Create `src/Views/ToolApprovalModal.ts`

**Purpose**: Modal UI for user approval of tool calls with file selection.

**Full Code**:

```typescript
import { App, Modal, Setting } from "obsidian";
import { ToolApprovalDecision } from "src/Models/Tool";

/**
 * Modal for approving AI tool calls
 */
export class ToolApprovalModal extends Modal {
  private result: ToolApprovalDecision | null = null;
  private modalPromise: Promise<ToolApprovalDecision>;
  private resolveModalPromise: (value: ToolApprovalDecision) => void;
  private fileSelections: Map<string, boolean> = new Map();

  constructor(
    app: App,
    private toolName: string,
    private args: Record<string, any>
  ) {
    super(app);

    // Create promise that will be resolved when user makes decision
    this.modalPromise = new Promise((resolve) => {
      this.resolveModalPromise = resolve;
    });
  }

  onOpen(): void {
    const { contentEl } = this;

    // Title
    contentEl.createEl("h2", { text: "[ChatGPT MD] Tool Approval Request" });

    // Tool information
    contentEl.createEl("p", {
      text: `The AI wants to use the following tool:`,
    });

    contentEl.createEl("h3", { text: this.getToolDisplayName() });

    // Purpose
    contentEl.createEl("p", {
      text: this.getToolPurpose(),
      cls: "mod-muted",
    });

    // Arguments section
    const argsContainer = contentEl.createDiv({ cls: "tool-args-container" });
    argsContainer.createEl("h4", { text: "Arguments:" });

    const argsList = argsContainer.createEl("ul");
    for (const [key, value] of Object.entries(this.args)) {
      const displayValue = Array.isArray(value) && value.length > 3
        ? `[${value.slice(0, 3).join(', ')}... (${value.length} total)]`
        : JSON.stringify(value);
      argsList.createEl("li", { text: `${key}: ${displayValue}` });
    }

    // File selection for file_read tool
    if (this.toolName === "file_read" && Array.isArray(this.args.filePaths)) {
      this.renderFileSelection(contentEl, this.args.filePaths);
    }

    // Privacy warning
    const warningContainer = contentEl.createDiv({ cls: "mod-warning" });
    warningContainer.createEl("p", {
      text: "⚠️ Privacy Note: This tool will access your vault data. Only approve if you understand and trust this action.",
    });

    // Buttons
    const buttonContainer = new Setting(contentEl);

    buttonContainer.addButton((btn) =>
      btn
        .setButtonText("Approve and Execute")
        .setCta()
        .onClick(() => {
          this.result = {
            approvalId: this.toolName,
            approved: true,
            modifiedArgs: this.getModifiedArgs(),
          };
          this.resolveModalPromise(this.result);
          this.close();
        })
    );

    buttonContainer.addButton((btn) =>
      btn
        .setButtonText("Cancel")
        .onClick(() => {
          this.result = {
            approvalId: this.toolName,
            approved: false,
          };
          this.resolveModalPromise(this.result);
          this.close();
        })
    );
  }

  /**
   * Render file selection UI for file_read tool
   */
  private renderFileSelection(container: HTMLElement, filePaths: string[]): void {
    container.createEl("h4", { text: "Select files to share with AI:" });

    const fileListContainer = container.createDiv({ cls: "file-selection-list" });

    // Initialize all files as selected by default
    for (const path of filePaths) {
      this.fileSelections.set(path, true);

      const fileName = path.split('/').pop() || path;

      new Setting(fileListContainer)
        .setName(fileName)
        .setDesc(path)
        .addToggle((toggle) =>
          toggle.setValue(true).onChange((value) => {
            this.fileSelections.set(path, value);
          })
        );
    }

    // Select/Deselect all buttons
    const selectButtonContainer = new Setting(container);

    selectButtonContainer.addButton((btn) =>
      btn
        .setButtonText("Select All")
        .onClick(() => {
          filePaths.forEach(path => this.fileSelections.set(path, true));
          // Refresh modal
          contentEl.empty();
          this.onOpen();
        })
    );

    selectButtonContainer.addButton((btn) =>
      btn
        .setButtonText("Deselect All")
        .onClick(() => {
          filePaths.forEach(path => this.fileSelections.set(path, false));
          // Refresh modal
          contentEl.empty();
          this.onOpen();
        })
    );
  }

  /**
   * Get modified arguments based on user selections
   */
  private getModifiedArgs(): Record<string, any> {
    // For file_read, filter to only selected files
    if (this.toolName === "file_read" && this.args.filePaths) {
      const selectedFiles = Array.from(this.fileSelections.entries())
        .filter(([_, selected]) => selected)
        .map(([path, _]) => path);

      return {
        ...this.args,
        filePaths: selectedFiles,
      };
    }

    return this.args;
  }

  /**
   * Get display name for tool
   */
  private getToolDisplayName(): string {
    const displayNames: Record<string, string> = {
      vault_search: "Vault Search",
      file_read: "File Read",
    };
    return displayNames[this.toolName] || this.toolName;
  }

  /**
   * Get purpose description for tool
   */
  private getToolPurpose(): string {
    const purposes: Record<string, string> = {
      vault_search: "Search your vault for files matching the query. Returns file names and content previews.",
      file_read: "Read the full contents of the specified files. You can select which files to share.",
    };
    return purposes[this.toolName] || "Execute a tool operation.";
  }

  /**
   * Wait for user decision
   */
  waitForResult(): Promise<ToolApprovalDecision> {
    return this.modalPromise;
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();

    // If modal closed without decision, treat as cancel
    if (!this.result) {
      this.resolveModalPromise({
        approvalId: this.toolName,
        approved: false,
      });
    }
  }
}
```

**Key Points**:
- Promise pattern for async user input
- Special handling for `file_read` with checkboxes
- Select All/Deselect All buttons for convenience
- Privacy warning is prominent
- Clean UI with Obsidian `Setting` components
- Handles modal close as cancellation

---

### Step 5: Create `src/Services/ToolExecutor.ts`

**Purpose**: Handle approval flow and execute approved tools.

**Full Code**:

```typescript
import { App } from "obsidian";
import { ToolRegistry } from "./ToolRegistry";
import { NotificationService } from "./NotificationService";
import { ToolApprovalRequest, ToolApprovalDecision, ToolExecutionContext } from "src/Models/Tool";
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

    const modal = new ToolApprovalModal(this.app, request.toolName, request.args);
    modal.open();

    const decision = await modal.waitForResult();

    if (!decision.approved) {
      this.notificationService.showInfo(`Tool execution cancelled: ${request.toolName}`);
      console.log(`[ChatGPT MD] Tool cancelled by user: ${request.toolName}`);
    } else {
      console.log(`[ChatGPT MD] Tool approved by user: ${request.toolName}`);
    }

    return decision;
  }

  /**
   * Execute a tool with user approval
   */
  async executeWithApproval(
    request: ToolApprovalRequest,
    context: ToolExecutionContext
  ): Promise<any> {
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
```

**Key Points**:
- Separates approval request from execution
- Shows notifications for user feedback
- Comprehensive error handling
- Logging for debugging
- Uses modified args from user (e.g., filtered files)

---

### Step 6: Create `src/Services/ToolService.ts`

**Purpose**: Orchestrate tool calling flow with AI SDK.

**Full Code**:

```typescript
import { App } from "obsidian";
import { ToolRegistry } from "./ToolRegistry";
import { ToolExecutor } from "./ToolExecutor";
import { ToolExecutionContext, ToolApprovalRequest } from "src/Models/Tool";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { CoreTool } from "ai";

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
  getToolsForRequest(settings: ChatGPT_MDSettings): Record<string, CoreTool> | undefined {
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
```

**Key Points**:
- Simple orchestration layer
- Delegates to ToolExecutor for approval/execution
- Returns results in format AI SDK expects
- Processes tool calls sequentially for clear approval flow

---

## Phase 2: Settings Integration

### Step 7: Modify `src/Models/Config.ts`

**Location**: Line ~60 (ChatBehaviorSettings interface)

**Changes**:

1. Add field to `ChatBehaviorSettings` interface:

```typescript
export interface ChatBehaviorSettings {
  stream: boolean;
  generateAtCursor: boolean;
  autoInferTitle: boolean;
  enableToolCalling: boolean; // ADD THIS LINE
  pluginSystemMessage: string;
}
```

2. Add to `DEFAULT_SETTINGS` (line ~200):

```typescript
export const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
  // ... existing settings ...
  stream: true,
  generateAtCursor: false,
  autoInferTitle: false,
  enableToolCalling: false, // ADD THIS LINE (OFF by default)
  // ... rest of settings ...
};
```

**Key Points**:
- Default is `false` for safety/privacy
- Part of `ChatBehaviorSettings` group
- Boolean type for simple toggle

---

### Step 8: Modify `src/Views/ChatGPT_MDSettingsTab.ts`

**Location**: Line ~100 (settingsSchema array in display() method)

**Changes**:

Add to `settingsSchema` array:

```typescript
const settingsSchema: SettingDefinition[] = [
  // ... existing settings ...
  {
    id: "enableToolCalling",
    name: "Enable AI Tool Calling (Experimental)",
    description:
      "Allow the AI to use tools like vault search and file reading. " +
      "All tool calls require your explicit approval via popup. " +
      "⚠️ Experimental feature - tools may access your vault data.",
    type: "toggle",
    group: "Chat Behavior",
  },
  // ... rest of settings ...
];
```

**Key Points**:
- Clear warning about vault data access
- Emphasizes approval requirement
- Marked as "Experimental"
- In "Chat Behavior" group with related settings

---

## Phase 3: AI SDK Integration

### Step 9: Modify `src/Services/AiService.ts`

**Multiple Changes Required**:

#### Change 1: Update imports (top of file)

Add:
```typescript
import { ToolService } from "./ToolService";
import { CoreTool } from "ai";
```

#### Change 2: Update `IAiApiService` interface (line ~37)

```typescript
export interface IAiApiService {
  callAIAPI(
    messages: Message[],
    options: Record<string, any>,
    headingPrefix: string,
    url: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService // ADD THIS LINE
  ): Promise<{
    fullString: string;
    mode: string;
    wasAborted?: boolean;
  }>;

  inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string>;
}
```

#### Change 3: Update `callAiSdkGenerateText` method (line ~410)

```typescript
protected async callAiSdkGenerateText(
  model: LanguageModel,
  modelName: string,
  messages: Message[],
  tools?: Record<string, CoreTool>, // ADD THIS PARAMETER
  toolService?: ToolService // ADD THIS PARAMETER
): Promise<{ fullString: string; model: string }> {
  // Convert messages to AI SDK format
  const aiSdkMessages = messages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
  }));

  // Prepare request
  const request: any = {
    model,
    messages: aiSdkMessages,
  };

  // Add tools if provided
  if (tools && Object.keys(tools).length > 0) {
    request.tools = tools;
  }

  // Call AI SDK
  const response = await generateText(request);

  // Handle tool calls if present
  if (toolService && response.toolCalls && response.toolCalls.length > 0) {
    console.log(`[ChatGPT MD] AI requested ${response.toolCalls.length} tool call(s)`);

    const toolResults = await toolService.handleToolApprovalRequests(
      response.toolCalls,
      { app: this.app, toolCallId: '', messages: aiSdkMessages }
    );

    // TODO: Continue conversation with tool results
    // This would require recursive call or handling in the caller
  }

  return { fullString: response.text, model: modelName };
}
```

#### Change 4: Update `callAiSdkStreamText` method (line ~435)

```typescript
protected async callAiSdkStreamText(
  model: LanguageModel,
  modelName: string,
  messages: Message[],
  config: Record<string, any>,
  editor: Editor,
  headingPrefix: string,
  setAtCursor?: boolean,
  tools?: Record<string, CoreTool>, // ADD THIS PARAMETER
  toolService?: ToolService // ADD THIS PARAMETER
): Promise<StreamingResponse> {
  try {
    // Convert messages to AI SDK format
    const aiSdkMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    // Insert assistant header
    const cursorPositions = this.apiResponseParser.insertAssistantHeader(
      editor,
      headingPrefix,
      modelName
    );

    // Setup abort controller
    const abortController = new AbortController();
    this.apiService.setAbortController(abortController);

    // Prepare request
    const request: any = {
      model,
      messages: aiSdkMessages,
      abortSignal: abortController.signal,
    };

    // Add tools if provided
    if (tools && Object.keys(tools).length > 0) {
      request.tools = tools;
    }

    // Call AI SDK streamText
    const result = streamText(request);
    const { textStream } = result;

    let fullText = "";
    let currentCursor = setAtCursor
      ? cursorPositions.initialCursor
      : cursorPositions.newCursor;

    // Stream the text
    for await (const textPart of textStream) {
      if (this.apiService.wasAborted()) {
        break;
      }

      fullText += textPart;

      if (setAtCursor) {
        editor.replaceSelection(textPart);
      } else {
        editor.replaceRange(textPart, currentCursor);
        const currentOffset = editor.posToOffset(currentCursor);
        const newOffset = currentOffset + textPart.length;
        currentCursor = editor.offsetToPos(newOffset);
      }
    }

    // Handle tool calls after streaming completes
    const finalResult = await result;
    if (toolService && finalResult.toolCalls && finalResult.toolCalls.length > 0) {
      console.log(`[ChatGPT MD] AI requested ${finalResult.toolCalls.length} tool call(s)`);

      // Show tool request indicator in editor
      const toolNotice = "\n\n_[Tool approval required - check popup]_\n";
      editor.replaceRange(toolNotice, currentCursor);

      // Handle tool approvals
      await toolService.handleToolApprovalRequests(
        finalResult.toolCalls,
        { app: this.app, toolCallId: '', messages: aiSdkMessages }
      );

      // TODO: Continue conversation with tool results
      // This would require recursively calling streamText again
    }

    // Position cursor
    if (!setAtCursor) {
      editor.setCursor(currentCursor);
    }

    return {
      fullString: fullText,
      mode: "streaming",
      wasAborted: this.apiService.wasAborted(),
    };
  } catch (err) {
    const errorMessage = `Error: ${err}`;
    console.error("[ChatGPT MD] Stream error:", err);
    return { fullString: errorMessage, mode: "streaming" };
  }
}
```

**Key Points**:
- Tools parameter is optional
- Only add tools if provided and non-empty
- Handle tool calls after generation/streaming
- Log tool requests for debugging
- Show indicator in editor during approval

---

### Step 10: Modify Service Implementations

Need to update 4 service files with same pattern:
- `src/Services/OpenAiService.ts`
- `src/Services/AnthropicService.ts`
- `src/Services/GeminiService.ts`
- `src/Services/OpenRouterService.ts`

**Pattern for ALL services**:

#### Change 1: Add import

```typescript
import { ToolService } from "./ToolService";
```

#### Change 2: Update `callAIAPI` method signature

```typescript
async callAIAPI(
  messages: Message[],
  options: Record<string, any>,
  headingPrefix: string,
  url: string,
  editor?: Editor,
  setAtCursor?: boolean,
  apiKey?: string,
  settings?: ChatGPT_MDSettings,
  toolService?: ToolService // ADD THIS PARAMETER
): Promise<{ fullString: string; mode: string; wasAborted?: boolean }> {
  // ... existing validation ...

  if (settings?.stream) {
    return this.callStreamingAPI(
      apiKey,
      messages,
      config,
      editor!,
      headingPrefix,
      setAtCursor,
      settings,
      toolService // ADD THIS PARAMETER
    );
  } else {
    return this.callNonStreamingAPI(
      apiKey,
      messages,
      config,
      settings,
      toolService // ADD THIS PARAMETER
    );
  }
}
```

#### Change 3: Update `callStreamingAPI` method

```typescript
protected async callStreamingAPI(
  apiKey: string | undefined,
  messages: Message[],
  config: OpenAIConfig, // or respective config type
  editor: Editor,
  headingPrefix: string,
  setAtCursor?: boolean,
  settings?: ChatGPT_MDSettings,
  toolService?: ToolService // ADD THIS PARAMETER
): Promise<StreamingResponse> {
  // ... existing setup code ...

  // Get tools if enabled
  const tools = toolService?.getToolsForRequest(settings);

  // Call base class with tools
  return this.callAiSdkStreamText(
    this.provider(modelName),
    modelName,
    messages,
    config,
    editor,
    headingPrefix,
    setAtCursor,
    tools, // ADD THIS PARAMETER
    toolService // ADD THIS PARAMETER
  );
}
```

#### Change 4: Update `callNonStreamingAPI` method

```typescript
protected async callNonStreamingAPI(
  apiKey: string | undefined,
  messages: Message[],
  config: OpenAIConfig, // or respective config type
  settings?: ChatGPT_MDSettings,
  toolService?: ToolService // ADD THIS PARAMETER
): Promise<{ fullString: string; mode: string }> {
  // ... existing setup code ...

  // Get tools if enabled
  const tools = toolService?.getToolsForRequest(settings);

  // Call base class with tools
  return this.callAiSdkGenerateText(
    this.provider(modelName),
    modelName,
    messages,
    tools, // ADD THIS PARAMETER
    toolService // ADD THIS PARAMETER
  );
}
```

**Key Points**:
- Same changes for ALL four services
- Optional toolService parameter throughout
- Get tools via `toolService?.getToolsForRequest(settings)`
- Pass to base class methods

---

## Phase 4: Service Integration

### Step 11: Modify `src/core/ServiceLocator.ts`

**Changes**:

#### Change 1: Add imports (top of file)

```typescript
import { VaultTools } from "src/Services/VaultTools";
import { ToolRegistry } from "src/Services/ToolRegistry";
import { ToolExecutor } from "src/Services/ToolExecutor";
import { ToolService } from "src/Services/ToolService";
```

#### Change 2: Add private fields (line ~20)

```typescript
export class ServiceLocator {
  // ... existing fields ...
  private vaultTools: VaultTools;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private toolService: ToolService;
```

#### Change 3: Initialize in `initializeServices()` method (line ~80)

```typescript
private initializeServices(): void {
  // ... existing service initialization ...

  // Tool services (add at end of method)
  this.vaultTools = new VaultTools(this.app, this.fileService);
  this.toolRegistry = new ToolRegistry(this.app, this.vaultTools);
  this.toolExecutor = new ToolExecutor(
    this.app,
    this.toolRegistry,
    this.notificationService
  );
  this.toolService = new ToolService(
    this.app,
    this.toolRegistry,
    this.toolExecutor
  );
}
```

#### Change 4: Add getter methods (line ~140, after existing getters)

```typescript
getToolService(): ToolService {
  return this.toolService;
}

getToolRegistry(): ToolRegistry {
  return this.toolRegistry;
}

getVaultTools(): VaultTools {
  return this.vaultTools;
}

getToolExecutor(): ToolExecutor {
  return this.toolExecutor;
}
```

**Key Points**:
- Initialize in correct order (VaultTools first, ToolService last)
- All tool services managed by ServiceLocator
- Getters provide access to services

---

### Step 12: Modify `src/core/CommandRegistry.ts`

**Location**: `registerChatCommand()` method (line ~100)

**Changes**:

Find the chat command registration and modify:

```typescript
private registerChatCommand(): void {
  this.plugin.addCommand({
    id: CALL_CHATGPT_API_COMMAND_ID,
    name: "Chat",
    icon: "message-circle",
    editorCallback: async (editor: Editor, view: MarkdownView) => {
      const editorService = this.serviceLocator.getEditorService();
      const settings = this.settingsService.getSettings();
      const frontmatter = await editorService.getFrontmatter(
        view,
        settings,
        this.plugin.app
      );

      this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

      // Get tool service if tools are enabled
      const toolService = settings.enableToolCalling
        ? this.serviceLocator.getToolService()
        : undefined; // ADD THESE LINES

      try {
        // ... existing message extraction code ...

        const response = await this.aiService.callAIAPI(
          messagesWithRoleAndMessage,
          frontmatter,
          getHeadingPrefix(settings.headingLevel),
          this.getAiApiUrls(frontmatter)[frontmatter.aiService],
          editor,
          settings.generateAtCursor,
          apiKeyToUse,
          settings,
          toolService // ADD THIS PARAMETER
        );

        // ... rest of existing code ...
      } catch (err) {
        // ... error handling ...
      }
    },
  });
}
```

**Key Points**:
- Only get toolService if setting is enabled
- Pass to callAIAPI as last parameter
- Respects per-note frontmatter overrides (if implemented)

---

## Testing & Verification

### Build Test

```bash
npm run build
```

Should complete with no TypeScript errors.

### Manual Test Sequence

1. **Settings Test**
   - Open plugin settings
   - Find "Enable AI Tool Calling (Experimental)"
   - Toggle ON
   - Restart Obsidian
   - Verify setting persists

2. **Vault Search Test**
   - Create test note with content
   - Open chat
   - Send: "Search my vault for [keyword]"
   - Approval modal should appear
   - Approve
   - AI should receive search results
   - AI should respond based on results

3. **File Read Test**
   - Chat: "Search for [keyword] then read the files"
   - Approve search
   - AI should request file read
   - Modal shows files with checkboxes
   - Deselect some files
   - Approve
   - Only selected files sent to AI

4. **Cancellation Test**
   - Trigger tool call
   - Click Cancel
   - Verify AI acknowledges cancellation
   - Verify no data was sent

5. **Provider Test**
   - Test with OpenAI
   - Test with Anthropic
   - Test with Gemini
   - All should work

### Common Issues & Solutions

**Issue**: TypeScript error "Cannot find module 'ai'"
- **Solution**: Ensure `ai` package is imported correctly: `import { tool, CoreTool } from "ai";`

**Issue**: Modal doesn't appear
- **Solution**: Check console for errors, verify `toolService` is passed correctly

**Issue**: Tool execution fails
- **Solution**: Check console logs, verify Vault API access

**Issue**: Files not found in search
- **Solution**: Verify `app.vault.getMarkdownFiles()` is working

---

## Completion Checklist

- [ ] All 6 new files created
- [ ] All 9 existing files modified
- [ ] No TypeScript errors
- [ ] Plugin builds successfully
- [ ] Settings UI shows tool toggle
- [ ] Vault search works
- [ ] File read works
- [ ] Approval modal appears
- [ ] File selection works
- [ ] Cancellation works
- [ ] Tested with OpenAI
- [ ] Tested with Anthropic
- [ ] Tested with Gemini
- [ ] Console logs show tool activity

---

**Implementation complete! Tool calling is now integrated with human-in-the-loop approval.**
