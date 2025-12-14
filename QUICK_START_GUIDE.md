# Quick Start Guide - AI Tool Calling Implementation

## For AI Agents: Fast Implementation Overview

This guide provides a quick overview for AI agents implementing tool calling. For detailed specifications, see the other documentation files.

## What We're Building

Add two tools to the ChatGPT MD plugin:

1. **vault_search** - Search vault by file name and content
2. **file_read** - Read file contents with user approval

**Key requirement**: Every tool call requires human approval via modal.

## Implementation Order (15 Files Total)

### ✅ Phase 1: New Files (6 files)

1. **`src/Models/Tool.ts`** - Type definitions
   - `ToolExecutionContext`, `ToolApprovalRequest`, `ToolApprovalDecision`
   - `VaultSearchResult`, `FileReadResult`

2. **`src/Services/VaultTools.ts`** - Vault operations
   - `searchVault(query, limit)` - Search using `app.vault.getMarkdownFiles()`
   - `readFiles(filePaths)` - Read using `app.vault.read()`

3. **`src/Services/ToolRegistry.ts`** - Tool registration
   - Register vault_search with Zod schema
   - Register file_read with Zod schema
   - `getEnabledTools(settings)` - Returns tools if enabled

4. **`src/Views/ToolApprovalModal.ts`** - Approval UI
   - Extends `Modal`
   - Shows tool name, args, privacy warning
   - For file_read: checkboxes per file
   - Returns `ToolApprovalDecision` via Promise

5. **`src/Services/ToolExecutor.ts`** - Approval handling
   - `requestApproval(request)` - Shows modal, waits for decision
   - `executeWithApproval(request, context)` - Approves then executes

6. **`src/Services/ToolService.ts`** - Orchestration
   - `getToolsForRequest(settings)` - Get tools if enabled
   - `handleToolApprovalRequests(toolCalls, context)` - Process approvals

### ✅ Phase 2: Settings (2 files)

7. **`src/Models/Config.ts`** - Add to `ChatBehaviorSettings`

   ```typescript
   enableToolCalling: boolean; // Add this field
   ```

   - Add to `DEFAULT_SETTINGS`: `enableToolCalling: false`

8. **`src/Views/ChatGPT_MDSettingsTab.ts`** - Add to schema
   ```typescript
   {
     id: "enableToolCalling",
     name: "Enable AI Tool Calling (Experimental)",
     description: "Allow AI to use tools...",
     type: "toggle",
     group: "Chat Behavior",
   }
   ```

### ✅ Phase 3: AI SDK Integration (5 files)

9. **`src/Services/AiService.ts`** - Base class modifications
   - Update `IAiApiService.callAIAPI()` - add `toolService?: ToolService` parameter
   - Update `callAiSdkGenerateText()` - add `tools?`, `toolService?` parameters
   - Update `callAiSdkStreamText()` - add `tools?`, `toolService?` parameters
   - Pass tools to `generateText()` and `streamText()`
   - Handle tool calls in response

10-13. **Service Implementations** (OpenAi, Anthropic, Gemini, OpenRouter)

- Update `callAIAPI()` - add `toolService?: ToolService` parameter
- Update `callStreamingAPI()` - add `toolService?: ToolService` parameter
- Update `callNonStreamingAPI()` - add `toolService?: ToolService` parameter
- Get tools: `const tools = toolService?.getToolsForRequest(settings)`
- Pass to base class

### ✅ Phase 4: Service Integration (2 files)

14. **`src/core/ServiceLocator.ts`** - Register services

- Add private fields: `vaultTools`, `toolRegistry`, `toolExecutor`, `toolService`
- Initialize in `initializeServices()`
- Add getters: `getToolService()`, `getToolRegistry()`

15. **`src/core/CommandRegistry.ts`** - Wire to commands

- In `registerChatCommand()`:

```typescript
const toolService = settings.enableToolCalling ? this.serviceLocator.getToolService() : undefined;
```

- Pass to `callAIAPI()`

## Critical Code Patterns

### Tool Definition with Zod (ToolRegistry.ts)

```typescript
import { tool } from "ai";
import { z } from "zod";

this.registerTool(
  "vault_search",
  tool({
    description: "Search vault for files by name or content",
    parameters: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().default(10),
    }),
    execute: async (args, context) => {
      return await this.vaultTools.searchVault(args, context);
    },
  })
);
```

### Modal Promise Pattern (ToolApprovalModal.ts)

```typescript
class ToolApprovalModal extends Modal {
  private modalPromise: Promise<ToolApprovalDecision>;
  private resolveModalPromise: (value: ToolApprovalDecision) => void;

  constructor(app: App, toolName: string, args: Record<string, any>) {
    super(app);
    this.modalPromise = new Promise((resolve) => {
      this.resolveModalPromise = resolve;
    });
  }

  onOpen() {
    // Build UI, buttons call this.resolveModalPromise(decision)
  }

  waitForResult(): Promise<ToolApprovalDecision> {
    return this.modalPromise;
  }
}
```

### Vault Search (VaultTools.ts)

```typescript
async searchVault(args: { query: string; limit?: number }) {
  const files = this.app.vault.getMarkdownFiles();
  const results = [];
  const query = args.query.toLowerCase();

  for (const file of files) {
    // Search filename
    if (file.basename.toLowerCase().includes(query)) {
      const content = await this.app.vault.read(file);
      results.push({
        path: file.path,
        basename: file.basename,
        matches: 1,
        preview: content.substring(0, 200)
      });
    }
    // Search content
    else {
      const content = await this.app.vault.read(file);
      if (content.toLowerCase().includes(query)) {
        results.push({
          path: file.path,
          basename: file.basename,
          matches: 1,
          preview: this.extractPreview(content, query)
        });
      }
    }

    if (results.length >= (args.limit || 10)) break;
  }

  return results;
}
```

### Passing Tools to AI SDK (AiService.ts)

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
): Promise<StreamingResponse> {
  const request: any = {
    model,
    messages: aiSdkMessages,
    abortSignal: abortController.signal,
  };

  if (tools) {
    request.tools = tools; // Add tools if provided
  }

  const result = streamText(request);
  // ... handle streaming ...

  // After streaming, handle tool calls
  const finalResult = await result;
  if (toolService && finalResult.toolCalls?.length > 0) {
    await toolService.handleToolApprovalRequests(
      finalResult.toolCalls,
      { app: this.app, toolCallId: '', messages: aiSdkMessages }
    );
  }
}
```

## Common Pitfalls

1. **Import CoreTool type**: `import { CoreTool } from "ai"` (not from 'ai-sdk')
2. **Use `tool()` helper**: Don't create tools manually
3. **Zod schemas**: Use `.describe()` on each field for AI guidance
4. **Modal cleanup**: Always call `contentEl.empty()` in `onClose()`
5. **Promise resolution**: Resolve modal promise even on cancel/close
6. **File reading**: Use `app.vault.read(file)`, not filesystem APIs
7. **TypeScript**: Add proper types, don't use `any` unnecessarily

## Testing Checklist

- [ ] Settings toggle appears and persists
- [ ] Vault search finds files by name
- [ ] Vault search finds files by content
- [ ] Approval modal shows for search
- [ ] Approval modal shows for file read
- [ ] File read shows checkboxes
- [ ] Deselecting files works
- [ ] Cancel prevents data sharing
- [ ] Works with OpenAI
- [ ] Works with Anthropic
- [ ] Works with Gemini
- [ ] No TypeScript errors
- [ ] Plugin builds successfully

## Time Estimates

- Phase 1: 2-3 hours (6 new files)
- Phase 2: 30 minutes (2 settings files)
- Phase 3: 1-2 hours (5 service files)
- Phase 4: 30 minutes (2 integration files)
- Testing: 1 hour

**Total: 4-6 hours**

## Next Steps

1. ✅ Review this quick start
2. 📖 Read [Technical Implementation Guide](TECHNICAL_IMPLEMENTATION_GUIDE.md) for detailed steps
3. 📋 Reference [Technical Specification](TOOL_TECHNICAL_SPEC.md) for exact code
4. 💻 Implement in phase order
5. ✅ Test thoroughly

## Questions?

- See detailed plan: `/Users/deniz.okcu/.claude/plans/sorted-rolling-owl.md`
- AI SDK docs: https://v6.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- Obsidian API: https://docs.obsidian.md/

---

**Ready to implement! Start with Phase 1, File 1: `src/Models/Tool.ts`**
