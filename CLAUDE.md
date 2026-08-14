# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatGPT MD is an Obsidian plugin that integrates multiple AI providers (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, LM Studio, Z.AI) into Obsidian for seamless chat interactions within markdown notes. Users can have AI conversations directly in their notes, with support for note linking, streaming responses, and per-note configuration via frontmatter.

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
npm run dev           # Development with watch mode
npm run build         # Production build with TypeScript checks
npm run build:analyze # Build with bundle analysis
npm run analyze       # Analyze bundle size without rebuilding
npm run lint          # Check code quality
npm run lint:fix      # Auto-fix linting issues
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

**Run single test file**: `npm test -- path/to/test.test.ts`

**Test suite**: Uses Jest with tests in `src/**/*.test.ts`. Tests cover utilities, provider registry behavior, and streaming helpers. Service and command flows are primarily validated via build/tests plus manual Obsidian checks.

## Architecture Overview

The plugin uses **constructor injection** via a centralized `ServiceContainer`:

- `src/core/ServiceContainer.ts` - DI container with readonly service instances
- **Only place** where dependencies are defined via `ServiceContainer.create()`
- All services receive dependencies through constructors (no service locator pattern)

**AI SDK**: Uses Vercel AI SDK (`ai` package) with provider-specific adapters (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`, `@ai-sdk/openai-compatible`). System/developer messages are converted to the AI SDK `instructions` option before calling `generateText()`/`streamText()`.

**HTTP Layer**: Uses `requestStream.ts` on desktop (Node.js http/https modules) with fallback to native `fetch()` on mobile. Wrapped by `ApiService.createFetchAdapter()` for AI SDK compatibility.

**Message flow**: User invokes chat command → SettingsService/EditorService resolve merged frontmatter (including agents) → EditorService extracts messages → MessageService parses (splits by `<hr class="__chatgpt_plugin">`, extracts `role::assistant` format, resolves wiki links) → ChatHandler prepends agent/system commands → AiProviderService selects adapter/provider from model prefix → system/developer messages become AI SDK `instructions` → API call via Vercel AI SDK → StreamingHandler streams response → EditorService processes the response

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
2. **Adapter Pattern** - `AiProviderService` uses provider-specific adapters (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, LM Studio, Z.AI) implementing `ProviderAdapter` interface
3. **Frontmatter-driven config** - Per-note settings override globals; merged at runtime by SettingsService
4. **Streaming responses** - Real-time AI output via Vercel AI SDK with line-boundary buffering and platform-specific handling (desktop Node.js vs mobile Web API)
5. **Link context injection** - Wiki links `[[Note Name]]` are resolved and content injected into prompts
6. **Command Handler Interface** - Commands implement `CommandHandler` with metadata; registered via `CommandRegistrar`
7. **Agent system** - Agent files (markdown with frontmatter + body) override model/temperature and provide system prompts; resolved at runtime via `agent` frontmatter field

## Adding a New AI Provider

See `src/Services/Providers/CLAUDE.md` for the authoritative step-by-step workflow (constants, defaults, settings model, adapter, registry, UI schema, docs/tests). Short version: add an adapter in `src/Services/Adapters/`, then register it once in `src/Services/Providers/ProviderRegistry.ts`.

## Model Selection

Models are specified with provider prefix:

- OpenAI: `openai@gpt-4.1-mini` (OpenAI is also the fallback for unprefixed model IDs)
- Anthropic: `anthropic@claude-sonnet-4-20250514`
- Gemini: `gemini@gemini-2.5-flash-lite`
- Ollama: `ollama@llama3.2`
- OpenRouter: `openrouter@anthropic/claude-3-5-sonnet`
- LM Studio: `lmstudio@model-name`
- Z.AI: `zai@glm-4.7`
- OrcaRouter: `orcarouter@orcarouter/auto`

The prefix determines which adapter handles the request in `AiProviderService`. OpenAI `search-preview` models must use the OpenAI chat-completions factory (`provider.chat(...)`) because the default Responses API path can return `Model not found` for those IDs.
