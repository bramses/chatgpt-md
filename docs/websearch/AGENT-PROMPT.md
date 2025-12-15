# Agent Instructions: WebSearch Tool Implementation

## Overview

This directory contains implementation tasks for adding a `web_search` tool to the ChatGPT-MD Obsidian plugin. The tool allows the LLM to search the web for information, with user approval required before sharing results.

## How to Use These Documents

### Task Order

Complete tasks in numerical order. Each task has dependencies noted at the bottom:

1. **01-define-types.md** - Add TypeScript interfaces (no dependencies)
2. **02-add-settings.md** - Add configuration options (depends on 01)
3. **03-create-service.md** - Create WebSearchService (depends on 01)
4. **04-create-modal.md** - Create approval modal (depends on 01)
5. **05-update-registry.md** - Register the tool (depends on 01, 03)
6. **06-update-service-locator.md** - Wire up dependencies (depends on 03, 05)
7. **07-process-results.md** - Handle results in ToolService (depends on 01, 04)
8. **08-settings-ui.md** - Add settings UI (depends on 02)

### Document Structure

Each task document contains:

- **Priority**: HIGH/MEDIUM/LOW
- **File**: Target file path (NEW for new files)
- **Goal**: What the task accomplishes
- **Implementation**: Code to add/modify
- **Location in File**: Where to make changes
- **Verification**: Commands to run after changes
- **Dependencies**: Which tasks must be done first
- **Notes**: Important implementation details

### Workflow

For each task:

1. Read the task document completely
2. Check dependencies are completed
3. Read the target file(s) to understand current structure
4. Make the changes as specified
5. Run verification commands:
   ```bash
   npm run build
   npm run lint
   ```
6. Fix any errors before moving to next task

### Reference Files

Before starting, familiarize yourself with these existing patterns:

| File | Purpose |
|------|---------|
| `src/Models/Tool.ts` | Existing tool type definitions |
| `src/Services/VaultTools.ts` | Reference for tool implementation |
| `src/Services/ToolRegistry.ts` | How tools are registered |
| `src/Services/ToolService.ts` | How tool results are processed |
| `src/Views/SearchResultsApprovalModal.ts` | Reference modal pattern |

### Key Patterns

1. **Human-in-the-loop**: All tool calls require user approval via modals
2. **Context messages**: Tool results become `role: 'user'` messages for the LLM
3. **Service Locator**: Dependencies injected through ServiceLocator
4. **Zod schemas**: Tool parameters validated with Zod

### Testing

After all tasks are complete:

1. Enable tool calling in settings
2. Enable web search in settings
3. Ask the LLM a question that requires web search
4. Verify approval modal appears
5. Select/deselect results
6. Verify approved results appear in LLM context
7. Test cancellation flow
8. Test with empty results

## Quick Start Command

```bash
# Start implementation
cat docs/websearch/01-define-types.md

# After each task
npm run build && npm run lint
```

## Architecture Diagram

```
User asks question requiring web info
    ↓
LLM requests web_search tool call
    ↓
ToolExecutor.requestApproval() → ToolApprovalModal
    ↓
WebSearchService.searchWeb() → Fetch search results
    ↓
ToolService.requestWebSearchResultsApproval() → WebSearchApprovalModal
    ↓
User selects which results to share
    ↓
ToolService.processToolResults() → Format as context messages
    ↓
LLM receives results and responds
```

## Important Notes

- DuckDuckGo is the default (free, no API key)
- Brave Search requires API key (free tier: 1,000 queries/month)
- Custom endpoint allows self-hosted solutions like SearXNG
- All results are selected by default in approval modal
- User can fetch full page content for deeper context
