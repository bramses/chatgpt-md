# Task 1: Extract Tool Handling Logic

## Priority: HIGH
## Impact: ~300 lines removed
## Risk: Medium (core functionality)

## Problem

The tool-handling logic is duplicated in two places:
- `callAiSdkGenerateText()` (lines 443-681) - non-streaming
- `callAiSdkStreamText()` (lines 782-997) - streaming

Both methods contain nearly identical logic for:
1. Filtering vault_search results
2. Requesting user approval
3. Converting tool results to context messages
4. Handling empty search results
5. Reading files from search results
6. Processing additional tool calls

## Solution

Extract shared logic into `ToolService.ts`.

## Files to Modify

- `src/Services/ToolService.ts`
- `src/Services/AiService.ts`

## Implementation Steps

### Step 1: Add new method to ToolService.ts

Add after line 100 (after `readFilesFromSearchResults`):

```typescript
/**
 * Process tool call results: filter, approve, and convert to context messages
 */
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
      if (result.length > 0) {
        const query = (correspondingToolCall?.input as any)?.query || 'unknown';
        const approvedResults = await this.requestSearchResultsApproval(query, result);

        filteredResults.push({ ...tr, result: approvedResults });

        if (approvedResults.length > 0) {
          // Read file contents for approved results
          const fileContents = await this.readFilesFromSearchResults(approvedResults);
          for (const fc of fileContents) {
            contextMessages.push({
              role: 'user',
              content: `[vault_search result]\n\nFile: ${fc.path}\n\n${fc.content}`,
            });
          }
        } else {
          contextMessages.push({
            role: 'user',
            content: `[vault_search result - no files found]\n\nThe search for "${query}" returned no results. Try searching with different keywords or single words.`,
          });
        }
      } else {
        // Empty results
        const query = (correspondingToolCall?.input as any)?.query || 'unknown';
        filteredResults.push(tr);
        contextMessages.push({
          role: 'user',
          content: `[vault_search result - no files found]\n\nThe search for "${query}" returned no results. Try searching with different keywords or single words.`,
        });
      }
    }
    // Handle file_read results
    else if (toolName === 'file_read' && Array.isArray(result) && result.length > 0) {
      filteredResults.push(tr);
      for (const fileResult of result) {
        if (fileResult.content && typeof fileResult.content === 'string') {
          contextMessages.push({
            role: 'user',
            content: `[file_read result]\n\nFile: ${fileResult.path}\n\n${fileResult.content}`,
          });
        }
      }
    }
    // Other tools
    else {
      filteredResults.push(tr);
    }
  }

  return { filteredResults, contextMessages };
}
```

### Step 2: Refactor callAiSdkGenerateText in AiService.ts

Replace lines 443-702 with:

```typescript
// Handle tool calls if present
if (toolService && response.toolCalls && response.toolCalls.length > 0) {
  console.log(`[ChatGPT MD] AI requested ${response.toolCalls.length} tool call(s)`);

  // Request user approval and execute tool calls
  const toolResults = await toolService.handleToolCalls(response.toolCalls);

  // Process results (filter, approve, get context)
  const { contextMessages } = await toolService.processToolResults(
    response.toolCalls,
    toolResults
  );

  // Build continuation messages
  const updatedMessages = [...aiSdkMessages];

  if (response.text?.trim()) {
    updatedMessages.push({ role: 'assistant', content: response.text });
  }

  updatedMessages.push(...contextMessages);

  // Call generateText again for final response (no tools - just answer)
  const continuationResponse = await generateText({
    model,
    messages: updatedMessages,
  });

  return { fullString: continuationResponse.text, model: modelName };
}

// No tool calls - return directly
return { fullString: response.text, model: modelName };
```

### Step 3: Refactor callAiSdkStreamText in AiService.ts

Replace lines 782-997 with similar simplified logic:

```typescript
// Handle tool calls after streaming completes
const finalResult = await result;
if (toolService && finalResult.toolCalls) {
  const toolCalls = await finalResult.toolCalls;
  if (toolCalls && toolCalls.length > 0) {
    console.log(`[ChatGPT MD] AI requested ${toolCalls.length} tool call(s)`);

    // Show indicator
    const toolNotice = '\n\n_[Tool approval required...]_\n';
    editor.replaceRange(toolNotice, currentCursor);
    currentCursor = editor.offsetToPos(editor.posToOffset(currentCursor) + toolNotice.length);

    // Execute and process tool calls
    const toolResults = await toolService.handleToolCalls(toolCalls);
    const { contextMessages } = await toolService.processToolResults(toolCalls, toolResults);

    // Clear indicator
    editor.replaceRange('', { line: currentCursor.line - 1, ch: 0 }, currentCursor);
    currentCursor = { line: currentCursor.line - 1, ch: 0 };

    // Build continuation messages
    const updatedMessages = [...aiSdkMessages];
    updatedMessages.push({ role: 'assistant', content: fullText });
    updatedMessages.push(...contextMessages);

    // Continue streaming
    const continuationResult = streamText({
      model,
      messages: updatedMessages,
    });

    for await (const textPart of continuationResult.textStream) {
      if (this.apiService.wasAborted()) break;
      fullText += textPart;
      editor.replaceRange(textPart, currentCursor);
      currentCursor = editor.offsetToPos(editor.posToOffset(currentCursor) + textPart.length);
    }
  }
}
```

## Testing

1. Test vault_search with approved results
2. Test vault_search with empty results
3. Test vault_search with user declining
4. Test file_read tool
5. Test non-streaming mode
6. Test streaming mode
7. Verify tool results are properly passed to LLM

## Verification

```bash
npm run build   # Should compile without errors
npm run lint    # Should pass linting
```
