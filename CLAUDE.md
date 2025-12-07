# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

ChatGPT MD is an Obsidian plugin that integrates multiple AI providers (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, LM Studio) into Obsidian for seamless chat interactions within markdown notes. Users can have AI conversations directly in their notes, with support for note linking, streaming responses, and per-note configuration via frontmatter.

## Quick Reference

**Entry point**: `src/main.ts` → `main.js`

**Common commands**:

```bash
npm run dev        # Development with watch mode
npm run build      # Production build with TypeScript checks
npm run lint       # Check code quality
npm run lint:fix   # Auto-fix linting issues
```

## Architecture Overview

The plugin uses **Service Locator pattern** for dependency injection:

- `src/core/ServiceLocator.ts` - Central DI container
- `src/core/CommandRegistry.ts` - Manages all Obsidian commands
- AI services implement `IAiApiService` interface

**Message flow**: User command → EditorService extracts messages → MessageService parses → AI service calls API → Response streamed to editor

## Code Organization

Each directory has its own CLAUDE.md with detailed context that auto-loads when you work in that area:

- `src/core/` - Core infrastructure (ServiceLocator, CommandRegistry)
- `src/Services/` - Service implementations
- `src/Views/` - UI components
- `src/Models/` - TypeScript interfaces

## Cross-cutting Documentation

For topics that span multiple areas:

- **[docs/development.md](docs/development.md)** - Build process, tooling, esbuild setup
- **[docs/message-flow.md](docs/message-flow.md)** - Complete flow from user input to AI response

## Key Design Patterns

1. **Service Locator** - Centralized dependency injection
2. **Strategy Pattern** - Different AI services, same interface
3. **Frontmatter-driven config** - Per-note settings override globals
4. **Streaming responses** - Real-time AI output with SSE
5. **Link context injection** - Auto-include `[[Wiki Links]]` in prompts
