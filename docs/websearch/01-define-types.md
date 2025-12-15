# Task 1: Define WebSearch Types

## Priority: HIGH
## File: src/Models/Tool.ts

## Goal

Add TypeScript interfaces for web search results and approval decisions.

## Implementation

Add the following interfaces to `src/Models/Tool.ts`:

```typescript
/**
 * Web search result from search API
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string; // Full page content if fetched
}

/**
 * Web search approval request
 */
export interface WebSearchApprovalRequest {
  query: string;
  results: WebSearchResult[];
}

/**
 * User's web search approval decision
 */
export interface WebSearchApprovalDecision {
  approved: boolean;
  approvedResults: WebSearchResult[];
}
```

## Location in File

Add after the existing `SearchResultsApprovalDecision` interface (around line 40).

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

None - this is the first task.

## Next Task

[02-add-settings](./02-add-settings.md)
