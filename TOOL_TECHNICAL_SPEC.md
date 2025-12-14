# Tool Calling - Technical Specification

Complete technical specification for AI SDK v6 tool calling implementation. This document contains all exact code, types, and specifications.

## Table of Contents

1. [Type Definitions](#type-definitions)
2. [Tool Definitions](#tool-definitions)
3. [Service Specifications](#service-specifications)
4. [UI Components](#ui-components)
5. [Integration Points](#integration-points)
6. [API Contracts](#api-contracts)

---

## Type Definitions

### src/Models/Tool.ts (Complete File)

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
  modifiedArgs?: Record<string, any>;
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

---

## Tool Definitions

### Vault Search Tool Specification

**Tool Name**: `vault_search`

**Zod Schema**:

```typescript
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
});
```

**Description**:
"Search the Obsidian vault for files by name or content. Returns file paths, names, and content previews. Use this to find relevant notes before reading them."

**Input Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| query | string | Yes | N/A | Search query for files |
| limit | number | No | 10 | Max results (max 50) |

**Output Format**:

```typescript
Array<{
  path: string; // Full path: "folder/file.md"
  basename: string; // Filename without extension
  matches: number; // Number of matches (currently always 1)
  preview: string; // 200 char preview or context around match
}>;
```

**Execution Logic**:

1. Get all markdown files via `app.vault.getMarkdownFiles()`
2. For each file:
   - Check if basename contains query (case-insensitive)
   - If not, read content and check if it contains query
   - If match, add to results with preview
3. Stop when limit reached (max 50)
4. Return results array

**Example Usage**:

```typescript
// Input
{ query: "typescript", limit: 5 }

// Output
[
  {
    path: "Programming/TypeScript Basics.md",
    basename: "TypeScript Basics",
    matches: 1,
    preview: "TypeScript is a typed superset of JavaScript..."
  },
  // ... more results
]
```

---

### File Read Tool Specification

**Tool Name**: `file_read`

**Zod Schema**:

```typescript
z.object({
  filePaths: z.array(z.string()).describe("Array of file paths to read. Use the paths returned from vault_search."),
});
```

**Description**:
"Read the full contents of specific files from the vault. User will be asked to approve which files to share. Use this after searching to get complete file contents."

**Input Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| filePaths | string[] | Yes | Array of file paths to read |

**Output Format**:

```typescript
Array<{
  path: string; // Full path of file
  content: string; // Full file contents
  size: number; // File size in bytes
}>;
```

**Execution Logic**:

1. User approves/selects files via modal
2. For each approved file path:
   - Get file via `app.vault.getAbstractFileByPath(path)`
   - Read content via `app.vault.read(file)`
   - Add to results with path, content, size
3. Handle errors gracefully (file not found, etc.)
4. Return results array

**Example Usage**:

```typescript
// Input
{
  filePaths: ["Notes/React.md", "Notes/Vue.md"];
}

// User selects only React.md in modal

// Output
[
  {
    path: "Notes/React.md",
    content: "# React\n\nReact is a JavaScript library...",
    size: 1024,
  },
];
```

---

## Service Specifications

### VaultTools Class

**File**: `src/Services/VaultTools.ts`

**Dependencies**:

- Obsidian `App`
- `FileService`

**Public Methods**:

#### searchVault()

```typescript
async searchVault(
  args: { query: string; limit?: number },
  context: ToolExecutionContext
): Promise<VaultSearchResult[]>
```

**Behavior**:

- Searches file names first, then content
- Case-insensitive search
- Returns preview (200 chars or context around match)
- Respects limit (max 50)
- Checks abort signal
- Logs search activity

#### readFiles()

```typescript
async readFiles(
  args: { filePaths: string[] },
  context: ToolExecutionContext
): Promise<FileReadResult[]>
```

**Behavior**:

- Reads each file by path
- Returns content, size
- Handles file not found errors
- Checks abort signal
- Logs read activity

#### extractPreview() (Private)

```typescript
private extractPreview(
  content: string,
  query: string,
  contextChars: number = 100
): string
```

**Behavior**:

- Finds query in content
- Extracts context around match
- Adds "..." if truncated
- Fallback to first 200 chars if query not found

---

### ToolRegistry Class

**File**: `src/Services/ToolRegistry.ts`

**Dependencies**:

- Obsidian `App`
- `VaultTools`
- AI SDK `tool`, `CoreTool`
- Zod

**Private Fields**:

```typescript
private tools: Map<string, CoreTool>
```

**Public Methods**:

#### registerTool()

```typescript
registerTool(name: string, tool: CoreTool): void
```

#### getTool()

```typescript
getTool(name: string): CoreTool | undefined
```

#### getAllTools()

```typescript
getAllTools(): Record<string, CoreTool>
```

#### getEnabledTools()

```typescript
getEnabledTools(settings: ChatGPT_MDSettings): Record<string, CoreTool> | undefined
```

**Behavior**:

- Returns `undefined` if `enableToolCalling` is false
- Returns all registered tools if enabled
- Used by ToolService to get tools for AI SDK

---

### ToolExecutor Class

**File**: `src/Services/ToolExecutor.ts`

**Dependencies**:

- Obsidian `App`
- `ToolRegistry`
- `NotificationService`
- `ToolApprovalModal`

**Public Methods**:

#### requestApproval()

```typescript
async requestApproval(
  request: ToolApprovalRequest
): Promise<ToolApprovalDecision>
```

**Behavior**:

- Opens ToolApprovalModal
- Waits for user decision
- Shows notification if cancelled
- Logs approval status

#### executeWithApproval()

```typescript
async executeWithApproval(
  request: ToolApprovalRequest,
  context: ToolExecutionContext
): Promise<any>
```

**Behavior**:

- Requests approval
- If cancelled, returns error object
- If approved, executes tool
- Uses modified args from user selection
- Handles execution errors
- Returns tool result or error

---

### ToolService Class

**File**: `src/Services/ToolService.ts`

**Dependencies**:

- Obsidian `App`
- `ToolRegistry`
- `ToolExecutor`

**Public Methods**:

#### getToolsForRequest()

```typescript
getToolsForRequest(
  settings: ChatGPT_MDSettings
): Record<string, CoreTool> | undefined
```

**Behavior**:

- Delegates to ToolRegistry
- Returns tools if enabled in settings
- Returns undefined if disabled

#### handleToolApprovalRequests()

```typescript
async handleToolApprovalRequests(
  toolCalls: any[],
  context: ToolExecutionContext
): Promise<any[]>
```

**Behavior**:

- Processes tool calls sequentially
- For each call, executes with approval
- Returns array of tool results
- Logs tool call activity

---

## UI Components

### ToolApprovalModal Class

**File**: `src/Views/ToolApprovalModal.ts`

**Extends**: Obsidian `Modal`

**Constructor**:

```typescript
constructor(
  app: App,
  private toolName: string,
  private args: Record<string, any>
)
```

**Private Fields**:

```typescript
private result: ToolApprovalDecision | null = null;
private modalPromise: Promise<ToolApprovalDecision>;
private resolveModalPromise: (value: ToolApprovalDecision) => void;
private fileSelections: Map<string, boolean> = new Map();
```

**Public Methods**:

#### waitForResult()

```typescript
waitForResult(): Promise<ToolApprovalDecision>
```

**UI Structure**:

```
┌─────────────────────────────────────────────────────────┐
│ [ChatGPT MD] Tool Approval Request                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ The AI wants to use the following tool:                 │
│                                                          │
│ ### [Tool Display Name]                                 │
│ [Tool purpose description]                              │
│                                                          │
│ #### Arguments:                                         │
│ • query: "machine learning"                             │
│ • limit: 10                                             │
│                                                          │
│ [File selection UI if file_read tool]                   │
│                                                          │
│ ⚠️ Privacy Note: This tool will access your vault data. │
│    Only approve if you understand and trust this action.│
│                                                          │
│ [ Approve and Execute ]  [ Cancel ]                     │
└─────────────────────────────────────────────────────────┘
```

**File Selection UI** (for file_read only):

```
#### Select files to share with AI:

[ ] filename1.md
    path/to/filename1.md

[✓] filename2.md
    path/to/filename2.md

[ Select All ]  [ Deselect All ]
```

**Behavior**:

- Blocks until user decides
- Special rendering for file_read tool
- Select/Deselect All buttons
- Returns modified args with selected files
- Treats modal close as cancellation

---

## Integration Points

### Config.ts Changes

**Location**: `src/Models/Config.ts`

**Add to ChatBehaviorSettings** (line ~60):

```typescript
export interface ChatBehaviorSettings {
  stream: boolean;
  generateAtCursor: boolean;
  autoInferTitle: boolean;
  enableToolCalling: boolean; // ADD THIS
  pluginSystemMessage: string;
}
```

**Add to DEFAULT_SETTINGS** (line ~200):

```typescript
enableToolCalling: false, // ADD THIS
```

---

### ChatGPT_MDSettingsTab.ts Changes

**Location**: `src/Views/ChatGPT_MDSettingsTab.ts`

**Add to settingsSchema** (line ~100):

```typescript
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
```

---

### ServiceLocator.ts Changes

**Location**: `src/core/ServiceLocator.ts`

**Add Imports**:

```typescript
import { VaultTools } from "src/Services/VaultTools";
import { ToolRegistry } from "src/Services/ToolRegistry";
import { ToolExecutor } from "src/Services/ToolExecutor";
import { ToolService } from "src/Services/ToolService";
```

**Add Fields** (line ~20):

```typescript
private vaultTools: VaultTools;
private toolRegistry: ToolRegistry;
private toolExecutor: ToolExecutor;
private toolService: ToolService;
```

**Add to initializeServices()** (line ~80):

```typescript
// Tool services
this.vaultTools = new VaultTools(this.app, this.fileService);
this.toolRegistry = new ToolRegistry(this.app, this.vaultTools);
this.toolExecutor = new ToolExecutor(this.app, this.toolRegistry, this.notificationService);
this.toolService = new ToolService(this.app, this.toolRegistry, this.toolExecutor);
```

**Add Getters** (line ~140):

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

---

### CommandRegistry.ts Changes

**Location**: `src/core/CommandRegistry.ts`

**In registerChatCommand()** (line ~100):

```typescript
// Get tool service if tools are enabled
const toolService = settings.enableToolCalling ? this.serviceLocator.getToolService() : undefined;

// ... later in callAIAPI ...

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
```

---

## API Contracts

### IAiApiService Interface Update

**Location**: `src/Services/AiService.ts` (line ~37)

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
    toolService?: ToolService // NEW PARAMETER
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

---

### BaseAiService Method Signatures

**Location**: `src/Services/AiService.ts`

#### callAiSdkGenerateText() (line ~410)

```typescript
protected async callAiSdkGenerateText(
  model: LanguageModel,
  modelName: string,
  messages: Message[],
  tools?: Record<string, CoreTool>, // NEW
  toolService?: ToolService // NEW
): Promise<{ fullString: string; model: string }>
```

#### callAiSdkStreamText() (line ~435)

```typescript
protected async callAiSdkStreamText(
  model: LanguageModel,
  modelName: string,
  messages: Message[],
  config: Record<string, any>,
  editor: Editor,
  headingPrefix: string,
  setAtCursor?: boolean,
  tools?: Record<string, CoreTool>, // NEW
  toolService?: ToolService // NEW
): Promise<StreamingResponse>
```

---

### Service Implementation Signatures

**All AI Services** (OpenAi, Anthropic, Gemini, OpenRouter, Ollama, LmStudio):

#### callAIAPI()

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
  toolService?: ToolService // NEW
): Promise<{ fullString: string; mode: string; wasAborted?: boolean }>
```

#### callStreamingAPI()

```typescript
protected async callStreamingAPI(
  apiKey: string | undefined,
  messages: Message[],
  config: [ServiceConfig], // OpenAIConfig, AnthropicConfig, etc.
  editor: Editor,
  headingPrefix: string,
  setAtCursor?: boolean,
  settings?: ChatGPT_MDSettings,
  toolService?: ToolService // NEW
): Promise<StreamingResponse>
```

#### callNonStreamingAPI()

```typescript
protected async callNonStreamingAPI(
  apiKey: string | undefined,
  messages: Message[],
  config: [ServiceConfig], // OpenAIConfig, AnthropicConfig, etc.
  settings?: ChatGPT_MDSettings,
  toolService?: ToolService // NEW
): Promise<{ fullString: string; mode: string }>
```

---

## Tool Execution Flow

### Complete Flow Diagram

```
User sends message
    ↓
CommandRegistry.registerChatCommand()
    ↓
Gets toolService if enabled
    ↓
Calls aiService.callAIAPI(..., toolService)
    ↓
Service calls callStreamingAPI(..., toolService)
    ↓
Gets tools: toolService.getToolsForRequest(settings)
    ↓
Calls base.callAiSdkStreamText(..., tools, toolService)
    ↓
Passes tools to streamText({ model, messages, tools })
    ↓
AI SDK decides to call tool
    ↓
Returns result with toolCalls array
    ↓
base.callAiSdkStreamText checks for toolCalls
    ↓
Calls toolService.handleToolApprovalRequests(toolCalls, context)
    ↓
For each tool call:
    ↓
    toolExecutor.executeWithApproval(request, context)
        ↓
        toolExecutor.requestApproval(request)
            ↓
            Opens ToolApprovalModal
            ↓
            User interacts with modal
            ↓
            User clicks Approve or Cancel
            ↓
            Modal resolves promise with decision
            ↓
        Returns ToolApprovalDecision
        ↓
        If approved:
            ↓
            Gets tool from registry
            ↓
            Executes tool with modified args
            ↓
            VaultTools.searchVault() or readFiles()
            ↓
            Returns tool result
        ↓
        If cancelled:
            ↓
            Returns error object
    ↓
Returns array of tool results
    ↓
[TODO: Continue conversation with results]
```

---

## Error Handling

### Error Scenarios and Responses

#### User Cancels Approval

**Detection**: `ToolApprovalDecision.approved === false`

**Response**:

```typescript
{
  error: "User cancelled tool execution";
}
```

**User Notification**: "Tool execution cancelled: [toolName]"

---

#### Tool Not Found

**Detection**: `toolRegistry.getTool(name)` returns undefined

**Response**:

```typescript
{
  error: "Unknown tool: [toolName]";
}
```

**User Notification**: "Unknown tool: [toolName]"

---

#### Tool Execution Error

**Detection**: Tool execute() throws exception

**Response**:

```typescript
{
  error: String(error);
}
```

**User Notification**: "Tool execution error: [error]"

**Console**: Full error with stack trace

---

#### File Not Found

**Detection**: `app.vault.getAbstractFileByPath()` returns null

**Response**:

```typescript
{
  path: "[path]",
  content: "File not found: [path]",
  size: 0
}
```

**Behavior**: Partial result returned (other files still read)

---

#### File Read Error

**Detection**: `app.vault.read()` throws exception

**Response**:

```typescript
{
  path: "[path]",
  content: "Error reading file: [error]",
  size: 0
}
```

**Behavior**: Partial result returned (other files still read)

---

## Logging Specification

### Console Log Format

All logs prefixed with `[ChatGPT MD]`:

```typescript
// Tool registration
console.log(`[ChatGPT MD] Registered tool: ${name}`);

// Search
console.log(`[ChatGPT MD] Vault search: "${query}" found ${results.length} results`);

// File read
console.log(`[ChatGPT MD] Read ${results.length} files`);

// Approval request
console.log(`[ChatGPT MD] Requesting approval for tool: ${toolName}`);

// Approval decision
console.log(`[ChatGPT MD] Tool approved by user: ${toolName}`);
console.log(`[ChatGPT MD] Tool cancelled by user: ${toolName}`);

// Execution
console.log(`[ChatGPT MD] Executing tool: ${toolName}`, args);
console.log(`[ChatGPT MD] Tool execution completed: ${toolName}`);

// Tool calls from AI
console.log(`[ChatGPT MD] AI requested ${toolCalls.length} tool call(s)`);
console.log(`[ChatGPT MD] Handling ${toolCalls.length} tool call(s)`);

// Errors
console.error(`[ChatGPT MD] ${errorMsg}`, error);
console.error("[ChatGPT MD] Stream error:", err);
```

---

## File Checklist

### New Files (6)

- [ ] `src/Models/Tool.ts` - Type definitions
- [ ] `src/Services/VaultTools.ts` - Vault operations
- [ ] `src/Services/ToolRegistry.ts` - Tool registration
- [ ] `src/Services/ToolExecutor.ts` - Approval handling
- [ ] `src/Services/ToolService.ts` - Orchestration
- [ ] `src/Views/ToolApprovalModal.ts` - Approval UI

### Modified Files (11)

- [ ] `src/Models/Config.ts` - Add enableToolCalling setting
- [ ] `src/Views/ChatGPT_MDSettingsTab.ts` - Add settings UI
- [ ] `src/Services/AiService.ts` - Add tools parameter
- [ ] `src/Services/OpenAiService.ts` - Pass tools
- [ ] `src/Services/AnthropicService.ts` - Pass tools
- [ ] `src/Services/GeminiService.ts` - Pass tools
- [ ] `src/Services/OpenRouterService.ts` - Pass tools
- [ ] `src/Services/OllamaService.ts` - Pass tools (graceful)
- [ ] `src/Services/LmStudioService.ts` - Pass tools (graceful)
- [ ] `src/core/ServiceLocator.ts` - Register services
- [ ] `src/core/CommandRegistry.ts` - Wire to commands

---

## Validation Criteria

### Build Validation

```bash
npm run build
```

- [ ] No TypeScript errors
- [ ] No import errors
- [ ] main.js generated successfully
- [ ] File size reasonable (check with `npm run build:size`)

### Runtime Validation

- [ ] Plugin loads without errors
- [ ] Settings UI shows tool toggle
- [ ] Toggle persists after restart
- [ ] Tool services initialize
- [ ] Console shows registration logs

### Functional Validation

- [ ] Vault search finds files by name
- [ ] Vault search finds files by content
- [ ] File read returns content
- [ ] Approval modal appears
- [ ] Modal shows correct info
- [ ] File selection works
- [ ] Approve executes tool
- [ ] Cancel prevents execution
- [ ] Multiple tools work in sequence

### Provider Validation

- [ ] Works with OpenAI
- [ ] Works with Anthropic
- [ ] Works with Gemini
- [ ] Works with OpenRouter
- [ ] Graceful with Ollama
- [ ] Graceful with LM Studio

---

**Specification Complete - Ready for Implementation**
