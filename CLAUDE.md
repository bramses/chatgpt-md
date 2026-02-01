# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatGPT MD is an Obsidian plugin that integrates multiple AI providers (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, LM Studio) into Obsidian for seamless chat interactions within markdown notes. Users can have AI conversations directly in their notes, with support for note linking, streaming responses, and per-note configuration via frontmatter.

## v3.0.0 - Privacy-First AI Tool Calling

Major feature: **Privacy-first AI tool calling** with human-in-the-loop approval:

- **Vault Search**: AI can search your notes (you approve which files to share)
- **File Reading**: AI can request access to specific files (you select which ones)
- **Web Search**: AI can search the web via Brave Search API (1,000 free queries/month)
- **Three-Layer Approval**: Approve execution → Review results → Select what to share
- **All tools disabled by default** (opt-in via Settings → ChatGPT MD → Tool Calling)

## Quick Reference

**Entry point**: `src/main.ts` → `main.js`

**Commands**:

```bash
npm run dev        # Development with watch mode
npm run build      # Production build with TypeScript checks
npm run lint       # Check code quality
npm run lint:fix   # Auto-fix linting issues
npm run analyze    # Bundle size analysis
```

**No test suite**: This project does not currently have automated tests.

## Architecture Overview

The plugin uses **constructor injection** via `ServiceContainer`:

- `src/core/ServiceContainer.ts` - DI container with readonly service instances
- `src/Commands/` - Command handlers (extracted from old CommandRegistry)
- `src/Services/AiProviderService.ts` - Unified AI service with adapter pattern

**AI SDK**: Uses Vercel AI SDK (`ai` package) with provider-specific adapters (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`).

**Message flow**: User command → EditorService extracts messages → MessageService parses → AiProviderService calls API → Response streamed to editor

## Code Organization

Each directory has its own CLAUDE.md with detailed context:

- `src/core/` - ServiceContainer (DI)
- `src/Commands/` - Obsidian command handlers
- `src/Services/` - Service implementations + `Adapters/` subdirectory
- `src/Views/` - UI components and modals
- `src/Models/` - TypeScript interfaces
- `src/Types/` - AI service type definitions
- `src/Utilities/` - Pure helper functions

## Cross-cutting Documentation

- **[docs/development.md](docs/development.md)** - Build process, tooling, esbuild setup
- **[docs/message-flow.md](docs/message-flow.md)** - Complete flow from user input to AI response

## Key Design Patterns

1. **Constructor Injection** - Dependencies passed via ServiceContainer
2. **Adapter Pattern** - Provider-specific adapters implement common interface
3. **Frontmatter-driven config** - Per-note settings override globals
4. **Streaming responses** - Real-time AI output via Vercel AI SDK
5. **Link context injection** - Auto-include `[[Wiki Links]]` in prompts
