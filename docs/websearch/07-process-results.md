# Task 7: Process WebSearch Results in ToolService

## Priority: HIGH
## File: src/Services/ToolService.ts

## Goal

Add web search result processing to ToolService, including the approval modal and context message creation.

## Implementation

### Step 1: Add imports

```typescript
import { WebSearchResult, WebSearchApprovalDecision } from "src/Models/Tool";
import { WebSearchApprovalModal } from "src/Views/WebSearchApprovalModal";
```

### Step 2: Add approval method

Add this new method to the class:

```typescript
/**
 * Request user approval for web search results before sharing with LLM
 */
async requestWebSearchResultsApproval(
  query: string,
  results: WebSearchResult[]
): Promise<WebSearchResult[]> {
  console.log(`[ChatGPT MD] Requesting approval for web search results: "${query}" (${results.length} results)`);

  const modal = new WebSearchApprovalModal(this.app, query, results);
  modal.open();

  const decision = await modal.waitForResult();

  if (!decision.approved) {
    console.log(`[ChatGPT MD] Web search results approval cancelled by user`);
    return [];
  }

  console.log(`[ChatGPT MD] User approved ${decision.approvedResults.length} of ${results.length} web search results`);
  return decision.approvedResults;
}
```

### Step 3: Update processToolResults method

Add web_search handling in the `processToolResults()` method, after the `file_read` handling block:

```typescript
// Handle web_search results - need approval
else if (toolName === 'web_search' && Array.isArray(result)) {
  if (result.length > 0) {
    const query = (correspondingToolCall?.input as any)?.query || 'unknown';
    const approvedResults = await this.requestWebSearchResultsApproval(query, result);

    filteredResults.push({ ...tr, result: approvedResults });

    if (approvedResults.length > 0) {
      // Format approved results as context messages
      for (const webResult of approvedResults) {
        contextMessages.push({
          role: 'user',
          content: `[web_search result]\n\nTitle: ${webResult.title}\nURL: ${webResult.url}\n\n${webResult.content || webResult.snippet}`,
        });
      }
    } else {
      contextMessages.push({
        role: 'user',
        content: `[web_search result - no results selected]\n\nThe web search for "${query}" returned results, but none were approved for sharing.`,
      });
    }
  } else {
    // Empty results
    const query = (correspondingToolCall?.input as any)?.query || 'unknown';
    filteredResults.push(tr);
    contextMessages.push({
      role: 'user',
      content: `[web_search result - no results found]\n\nThe web search for "${query}" returned no results. Try different search terms.`,
    });
  }
}
```

## Complete processToolResults Method Structure

After all changes, the method should look like:

```typescript
async processToolResults(
  toolCalls: any[],
  toolResults: any[]
): Promise<{
  filteredResults: any[];
  contextMessages: Array<{ role: 'user'; content: string }>;
}> {
  const contextMessages: Array<{ role: 'user'; content: string }> = [];
  const filteredResults: any[] = [];

  for (const tr of toolResults) {
    const correspondingToolCall = toolCalls.find((tc: any) => {
      const tcId = tc.toolCallId || tc.id || 'unknown';
      return tcId === tr.toolCallId;
    });

    const toolName = correspondingToolCall?.toolName;
    const result = tr.result;

    // Handle vault_search results - need approval
    if (toolName === 'vault_search' && Array.isArray(result)) {
      // ... existing vault_search handling ...
    }
    // Handle file_read results
    else if (toolName === 'file_read' && Array.isArray(result) && result.length > 0) {
      // ... existing file_read handling ...
    }
    // Handle web_search results - need approval
    else if (toolName === 'web_search' && Array.isArray(result)) {
      // ... new web_search handling (see Step 3) ...
    }
    // Other tools
    else {
      filteredResults.push(tr);
    }
  }

  return { filteredResults, contextMessages };
}
```

## Location in File

- Imports: Top of file
- `requestWebSearchResultsApproval()`: After `requestSearchResultsApproval()` method (~line 53)
- `processToolResults()`: Add web_search block after file_read block (~line 168)

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

- Task 1 (types) must be completed
- Task 4 (WebSearchApprovalModal) must be completed

## Notes

- Pattern mirrors vault_search handling
- All approved results become context messages
- Empty results inform the LLM to try different terms
- Cancelled approval tells LLM no results were shared

## Next Task

[08-settings-ui](./08-settings-ui.md)
