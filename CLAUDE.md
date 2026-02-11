# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatGPT MD is an Obsidian plugin that integrates multiple AI providers (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, LM Studio) into Obsidian for seamless chat interactions within markdown notes. Users can have AI conversations directly in their notes, with support for note linking, streaming responses, and per-note configuration via frontmatter.

## v3.1.0 - Agents System

- **Agent files**: Markdown files in a configurable agent folder with frontmatter (model, temperature, stream) and a body that becomes the system prompt
- **Choose Agent command**: Select an agent to apply to the current note (sets `agent` frontmatter field)
- **Create Agent command**: Create agents manually or via AI Wizard (AI generates name, temperature, system prompt from a description)
- **Agent resolution**: When a note has `agent: AgentName` in frontmatter, the agent's settings (model, temperature) and body (system message) are merged into the chat configuration
- **Merge priority**: defaultConfig < defaultFrontmatter < settings < agentFrontmatter < noteFrontmatter

## v3.0.0 - Privacy-First AI Tool Calling

- **Vault Search**: AI can search your notes (you approve which files to share)
- **File Reading**: AI can request access to specific files (you select which ones)
- **Web Search**: AI can search the web via Brave Search API (1,000 free queries/month)
- **Three-Layer Approval**: Approve execution → Review results → Select what to share
- **All tools disabled by default** (opt-in via Settings → ChatGPT MD → Tool Calling)

## Quick Reference

**Entry point**: `src/main.ts` → `main.js`

**Commands**:

```bash
yarn dev           # Development with watch mode
yarn build         # Production build with TypeScript checks
yarn build:analyze # Build with bundle analysis
yarn analyze       # Analyze bundle size without rebuilding
yarn lint          # Check code quality
yarn lint:fix      # Auto-fix linting issues
yarn test          # Run tests
yarn test:watch    # Run tests in watch mode
yarn test:coverage # Run tests with coverage
```

**Run single test file**: `yarn test path/to/test.test.ts`

**Test suite**: Uses Jest with tests in `src/**/*.test.ts`. Tests cover utility functions and pure functions. Tests are NOT used for services or command handlers (those are tested manually).

## Architecture Overview

The plugin uses **constructor injection** via a centralized `ServiceContainer`:

- `src/core/ServiceContainer.ts` - DI container with readonly service instances
- **Only place** where dependencies are defined via `ServiceContainer.create()`
- All services receive dependencies through constructors (no service locator pattern)

**AI SDK**: Uses Vercel AI SDK (`ai` package) with provider-specific adapters (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`).

**Message flow**: User invokes chat command → EditorService extracts messages → MessageService parses (splits by `<hr class="__chatgpt_plugin">`, extracts `role::assistant` format, resolves wiki links) → FrontmatterManager merges per-note settings → AiProviderService selects adapter → API call → StreamingHandler streams response → EditorService inserts into editor

## Code Organization

Each directory has its own CLAUDE.md with detailed context:

- `src/core/` - ServiceContainer (DI), plugin initialization
- `src/Commands/` - Obsidian command handlers (ChatHandler, ModelSelectHandler, AgentHandlers, etc.)
- `src/Services/` - Service implementations + `Adapters/` subdirectory
- `src/Views/` - UI components and modals
- `src/Models/` - TypeScript interfaces
- `src/Types/` - AI service type definitions
- `src/Utilities/` - Pure helper functions (well-tested)

## Cross-cutting Documentation

- **[docs/development.md](docs/development.md)** - Build process, tooling, esbuild setup
- **[docs/message-flow.md](docs/message-flow.md)** - Complete flow from user input to AI response

## Key Design Patterns

1. **Constructor Injection** - Dependencies passed via ServiceContainer; never instantiate services directly outside `ServiceContainer.create()`
2. **Adapter Pattern** - `AiProviderService` uses provider-specific adapters (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, LM Studio) implementing `ProviderAdapter` interface
3. **Frontmatter-driven config** - Per-note settings override globals; merged at runtime by FrontmatterManager
4. **Streaming responses** - Real-time AI output via Vercel AI SDK with platform-specific handling (desktop Node.js vs mobile Web API)
5. **Link context injection** - Wiki links `[[Note Name]]` are resolved and content injected into prompts
6. **Command Handler Interface** - Commands implement `CommandHandler` with metadata; registered via `CommandRegistrar`
7. **Agent system** - Agent files (markdown with frontmatter + body) override model/temperature and provide system prompts; resolved at runtime via `agent` frontmatter field

## Adding a New AI Provider

1. Create adapter in `src/Services/Adapters/` implementing `ProviderAdapter`
2. Add provider-specific configuration to settings
3. Register adapter in `AiProviderService` (provider selection by model prefix: `ollama@`, `openrouter@`, etc.)
4. Add URL configuration parameter (e.g., `providerUrl`)

## Model Selection

Models are specified with provider prefix:

- OpenAI: `gpt-4o` (no prefix, default)
- Ollama: `ollama@llama3.2`
- OpenRouter: `openrouter@anthropic/claude-3-5-sonnet`
- LM Studio: `lmstudio@model-name`

The prefix determines which adapter handles the request in `AiProviderService`.
