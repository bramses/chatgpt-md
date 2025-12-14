# AI SDK v6 Tool Calling - Implementation Plan

## Overview

This document provides a comprehensive plan for implementing AI SDK v6 tool calling in the ChatGPT MD Obsidian plugin. This enables the AI to search the vault and read files with **mandatory human-in-the-loop approval** for every tool call.

## Quick Links

- **[Quick Start Guide](QUICK_START_GUIDE.md)** - Fast overview for AI agents
- **[Technical Implementation Guide](TECHNICAL_IMPLEMENTATION_GUIDE.md)** - Detailed step-by-step instructions
- **[Technical Specification](TOOL_TECHNICAL_SPEC.md)** - Exact code specifications and interfaces

## Project Goals

1. ✅ Enable AI to search vault by file name and content
2. ✅ Enable AI to read specific files with user approval
3. ✅ Implement human-in-the-loop for ALL tool calls
4. ✅ Follow AI SDK v6 best practices
5. ✅ Maintain privacy and security
6. ✅ Settings integration (default OFF)

## User Requirements

Based on user decisions:

- **Search Scope**: File names AND content (full search)
- **Providers**: OpenAI, Anthropic, Gemini, OpenRouter
- **Initial Tools**: Vault search + file read (two tools)
- **Modal Type**: Blocking modal (standard approach)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interaction                          │
│  1. User sends chat with tools enabled                       │
│  2. AI decides to use tool                                   │
│  3. Approval modal appears                                   │
│  4. User approves/cancels                                    │
│  5. Tool executes (if approved)                             │
│  6. Results returned to AI                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Component Architecture                      │
└─────────────────────────────────────────────────────────────┘

CommandRegistry (initiates chat with tools)
    ↓
BaseAiService (calls AI SDK with tools parameter)
    ↓
AI SDK v6 (generateText/streamText with tools)
    ↓
ToolService (orchestrates tool flow)
    ↓
ToolExecutor (shows modal, handles approval)
    ↓
ToolApprovalModal (user interaction)
    ↓
VaultTools (executes Obsidian operations)

Supporting Components:
- ToolRegistry: Registers and manages tool definitions
- Config: Settings for enableToolCalling
- ServiceLocator: Dependency injection for tool services
```

## Implementation Phases

### Phase 1: Foundation (New Files)

Create 6 new files with core tool functionality:

1. **`src/Models/Tool.ts`** - TypeScript type definitions
2. **`src/Services/VaultTools.ts`** - Obsidian vault operations
3. **`src/Services/ToolRegistry.ts`** - Tool registration with Zod
4. **`src/Views/ToolApprovalModal.ts`** - User approval UI
5. **`src/Services/ToolExecutor.ts`** - Approval flow handling
6. **`src/Services/ToolService.ts`** - Main orchestration

### Phase 2: Settings Integration

Modify 2 files to add tool calling settings:

7. **`src/Models/Config.ts`** - Add `enableToolCalling: boolean`
8. **`src/Views/ChatGPT_MDSettingsTab.ts`** - Add settings UI

### Phase 3: AI SDK Integration

Modify 5 files to integrate tools with AI SDK:

9. **`src/Services/AiService.ts`** - Add tools parameter to base methods
10. **`src/Services/OpenAiService.ts`** - Pass tools to base
11. **`src/Services/AnthropicService.ts`** - Pass tools to base
12. **`src/Services/GeminiService.ts`** - Pass tools to base
13. **`src/Services/OpenRouterService.ts`** - Pass tools to base

### Phase 4: Service Integration

Modify 2 files to wire everything together:

14. **`src/core/ServiceLocator.ts`** - Register tool services
15. **`src/core/CommandRegistry.ts`** - Pass tool service to AI calls

## Key Design Decisions

### 1. Human-in-the-Loop Approval

- **Every** tool call requires explicit user approval
- Modal blocks until user decides
- User can see exactly what will be shared
- Cancel prevents any data from being sent

### 2. Two-Tool Approach

- **vault_search**: Searches file names and content, returns previews
- **file_read**: Reads full file contents, user selects which files

This allows AI to:

1. First search for relevant files
2. Then request to read specific files
3. User approves each step separately

### 3. Privacy-First Design

- Tool calling **disabled by default**
- Search shows previews (200 chars), not full content
- File read shows checkboxes - user selects which files to share
- Limit results (10 default, 50 max) to prevent token overflow

### 4. AI SDK v6 Best Practices

- Use `tool()` helper from AI SDK
- Zod schemas for type-safe parameter validation
- Tools passed to `generateText()` and `streamText()`
- Proper handling of tool call lifecycle

## File Organization

```
src/
├── Models/
│   ├── Config.ts (MODIFIED - add enableToolCalling)
│   └── Tool.ts (NEW - type definitions)
├── Services/
│   ├── AiService.ts (MODIFIED - add tools parameter)
│   ├── OpenAiService.ts (MODIFIED - pass tools)
│   ├── AnthropicService.ts (MODIFIED - pass tools)
│   ├── GeminiService.ts (MODIFIED - pass tools)
│   ├── OpenRouterService.ts (MODIFIED - pass tools)
│   ├── VaultTools.ts (NEW - vault operations)
│   ├── ToolRegistry.ts (NEW - tool registration)
│   ├── ToolExecutor.ts (NEW - approval handling)
│   └── ToolService.ts (NEW - orchestration)
├── Views/
│   ├── ChatGPT_MDSettingsTab.ts (MODIFIED - add setting)
│   └── ToolApprovalModal.ts (NEW - approval UI)
└── core/
    ├── ServiceLocator.ts (MODIFIED - register services)
    └── CommandRegistry.ts (MODIFIED - pass tool service)
```

## Dependencies

Already installed:

- ✅ `ai@6.0.0-beta.134` - AI SDK v6
- ✅ `zod@4.1.13` - Schema validation
- ✅ `obsidian@latest` - Obsidian API

No additional packages needed!

## Testing Strategy

### Manual Testing Checklist

1. **Enable tool calling**
   - Open settings
   - Enable "Enable AI Tool Calling"
   - Verify setting persists

2. **Vault search test**
   - Send chat: "Search my vault for notes about TypeScript"
   - Verify approval modal appears
   - Approve
   - Verify results shown to AI
   - Verify AI responds based on search results

3. **File read test**
   - Chat: "Search for React notes, then read them"
   - Approve search
   - AI sees results, requests file read
   - Modal shows files with checkboxes
   - Deselect some files
   - Approve
   - Verify only selected files sent

4. **Cancellation test**
   - Request tool
   - Click Cancel
   - Verify no data sent
   - Verify AI acknowledges cancellation

5. **Multi-provider test**
   - Test with OpenAI (should work)
   - Test with Anthropic (should work)
   - Test with Gemini (should work)
   - Test with OpenRouter (should work)

## Success Criteria

Implementation is complete when:

- ✅ All 6 new files created and functioning
- ✅ All 9 existing files modified correctly
- ✅ Settings UI shows tool calling toggle
- ✅ Approval modal appears for every tool call
- ✅ Vault search works (name + content)
- ✅ File read works with file selection
- ✅ Cancellation prevents data sharing
- ✅ Works with OpenAI, Anthropic, Gemini, OpenRouter
- ✅ No TypeScript errors
- ✅ Plugin builds successfully
- ✅ Manual tests pass

## Implementation Timeline

Estimated: 4-6 hours for experienced developer

- Phase 1 (Foundation): 2-3 hours
- Phase 2 (Settings): 30 minutes
- Phase 3 (AI SDK): 1-2 hours
- Phase 4 (Integration): 30 minutes
- Testing: 1 hour

## Next Steps

1. Read **[Quick Start Guide](QUICK_START_GUIDE.md)** for overview
2. Read **[Technical Implementation Guide](TECHNICAL_IMPLEMENTATION_GUIDE.md)** for step-by-step instructions
3. Reference **[Technical Specification](TOOL_TECHNICAL_SPEC.md)** for exact code
4. Implement in order: Phase 1 → 2 → 3 → 4
5. Test thoroughly after each phase

## Support & Documentation

- AI SDK v6 Docs: https://v6.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- Obsidian API Docs: https://docs.obsidian.md/
- Existing codebase docs: See `CLAUDE.md` files in each directory
- Plan file: `/Users/deniz.okcu/.claude/plans/sorted-rolling-owl.md`

---

**Ready for implementation by AI agents or human developers!**
