# WebSearch Tool Implementation Overview

## Goal

Add a new `web_search` tool that allows the LLM to search the web for information. The tool follows the same human-in-the-loop approval pattern as existing tools (`vault_search`, `file_read`).

## Feature Summary

- **User approval required** before any web search is executed
- **Selective result sharing** - users choose which results to share with the LLM
- **Content format** similar to file tools - results formatted as context messages
- **Optional full page content** - can fetch complete page content for deeper context
- **Privacy-focused** - no data sent without explicit user consent

## Architecture

The websearch tool integrates with the existing tool system:

```
User asks question requiring web info
    ↓
LLM requests web_search tool call
    ↓
ToolExecutor.requestApproval() → ToolApprovalModal (user approves search)
    ↓
WebSearchService.searchWeb() → Fetch search results from API
    ↓
ToolService.requestWebSearchResultsApproval() → WebSearchApprovalModal
    ↓
User selects which results to share
    ↓
ToolService.processToolResults() → Format as context messages
    ↓
LLM receives results and responds
```

## Tasks (in order)

| Task | File | Description |
|------|------|-------------|
| [01-define-types](./01-define-types.md) | src/Models/Tool.ts | Add WebSearchResult interfaces |
| [02-add-settings](./02-add-settings.md) | src/Models/Config.ts | Add web search configuration |
| [03-create-service](./03-create-service.md) | src/Services/WebSearchService.ts | Create search service |
| [04-create-modal](./04-create-modal.md) | src/Views/WebSearchApprovalModal.ts | Create approval modal |
| [05-update-registry](./05-update-registry.md) | src/Services/ToolRegistry.ts | Register web_search tool |
| [06-update-service-locator](./06-update-service-locator.md) | src/core/ServiceLocator.ts | Initialize WebSearchService |
| [07-process-results](./07-process-results.md) | src/Services/ToolService.ts | Handle web_search processing |
| [08-settings-ui](./08-settings-ui.md) | src/Views/SettingsTab.ts | Add settings UI |

## Key Files Reference

Understand these before implementing:

| File | Purpose |
|------|---------|
| `src/Models/Tool.ts` | Type definitions for tools |
| `src/Services/ToolRegistry.ts` | Tool registration with AI SDK |
| `src/Services/ToolExecutor.ts` | Tool approval workflow |
| `src/Services/ToolService.ts` | Tool orchestration and result processing |
| `src/Services/VaultTools.ts` | Reference for tool implementation pattern |
| `src/Views/SearchResultsApprovalModal.ts` | Reference for approval modal pattern |

## Search API Options

The implementation should support multiple search providers:

1. **DuckDuckGo Instant Answer API** (default) - Free, no API key
2. **Brave Search API** - Free tier (1,000 queries/month)
3. **Custom endpoint** - User-configurable

## Verification

After each task:
```bash
npm run build   # Should compile without errors
npm run lint    # Should pass linting
```

## Testing

Manual testing checklist:
1. Enable web search in settings
2. Ask LLM a question requiring web search
3. Verify approval modal appears with search query
4. Verify results approval modal shows search results
5. Select/deselect results
6. Verify approved results appear in LLM response
7. Test with empty results
8. Test cancellation flow
