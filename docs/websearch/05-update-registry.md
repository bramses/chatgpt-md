# Task 5: Update ToolRegistry

## Priority: HIGH
## File: src/Services/ToolRegistry.ts

## Goal

Register the `web_search` tool in the ToolRegistry so the AI can request web searches.

## Implementation

### Step 1: Add WebSearchService dependency

Update the constructor to accept WebSearchService:

```typescript
import { WebSearchService } from "./WebSearchService";

export class ToolRegistry {
  private tools: Map<string, any> = new Map();

  constructor(
    private app: App,
    private vaultTools: VaultTools,
    private webSearchService: WebSearchService  // Add this
  ) {
    this.registerDefaultTools();
  }
```

### Step 2: Register web_search tool

Add to `registerDefaultTools()` after the file_read tool:

```typescript
// Web search tool - approval handled manually before execution
const webSearchTool = tool({
  description:
    "Search the web for information on a topic. Returns titles, URLs, and snippets from search results. User will be asked to approve which results to share.",
  inputSchema: zodSchema(
    z.object({
      query: z
        .string()
        .describe("The search query to look up on the web"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of search results to return. Default is 5, maximum is 10."),
    })
  ),
  execute: async (args: { query: string; limit?: number }) => {
    // Tool execution - approval is handled by the caller via ToolService
    return await this.webSearchService.searchWeb(
      args,
      'duckduckgo'  // Default provider, settings will be passed from caller
    );
  },
});
this.registerTool("web_search", webSearchTool);
```

### Step 3: Update getEnabledTools

Modify `getEnabledTools()` to check web search setting:

```typescript
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
```

## Location in File

- Constructor: Line ~13
- `registerDefaultTools()`: After file_read tool registration (~line 79)
- `getEnabledTools()`: Line ~111

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

- Task 1 (types) must be completed
- Task 3 (WebSearchService) must be completed

## Notes

- The tool description tells the LLM what it does
- Parameters use Zod schema for validation
- Approval is handled by ToolService, not here
- Settings check enables/disables the tool

## Next Task

[06-update-service-locator](./06-update-service-locator.md)
