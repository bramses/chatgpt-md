# Task 2: Add WebSearch Settings

## Priority: HIGH
## File: src/Models/Config.ts

## Goal

Add configuration options for the web search feature.

## Implementation

Add the following properties to the `ChatGPT_MDSettings` interface:

```typescript
// In ChatGPT_MDSettings interface
enableWebSearch: boolean;           // Enable/disable web search tool
webSearchProvider: 'duckduckgo' | 'brave' | 'custom';  // Search provider
webSearchApiKey?: string;           // API key for providers that require it
webSearchApiUrl?: string;           // Custom search API endpoint
fetchFullContent: boolean;          // Fetch full page content for results
maxWebSearchResults: number;        // Maximum results to return (default: 5)
```

## Default Values

Add defaults in `DEFAULT_SETTINGS`:

```typescript
enableWebSearch: false,
webSearchProvider: 'duckduckgo',
webSearchApiKey: '',
webSearchApiUrl: '',
fetchFullContent: false,
maxWebSearchResults: 5,
```

## Location in File

Find the `ChatGPT_MDSettings` interface and add after `enableToolCalling`.
Find `DEFAULT_SETTINGS` and add corresponding defaults.

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

- Task 1 (types) should be completed first

## Next Task

[03-create-service](./03-create-service.md)
