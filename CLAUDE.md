# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChatGPT MD is an Obsidian plugin that integrates multiple AI providers (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, LM Studio, Z.AI) into Obsidian for seamless chat interactions within markdown notes. Users can have AI conversations directly in their notes, with support for note linking, streaming responses, and per-note configuration via frontmatter.

## v3.3.0 - ChatGPT History Knowledge Import (opt-in)

- **Two layers**: every conversation from an official ChatGPT export is preserved unchanged in a source archive (Layer A); the meaning inside it is extracted into semantic units and routed into the right vault (Layer B)
- **Multi-vault routing**: vaults are discovered from Obsidian plus a configurable registry; personal meaning never lands in a project vault and project work never lands in the personal vault
- **Durable notes**: units merge into canonical concept/dream/person/media notes with dated evidence and provenance, instead of creating duplicate summaries
- **Continuous ingestion**: an inbox folder (and a generic live-capture payload) run through the same pipeline as the historical import; a later export reconciles what was missed
- **Resumable and idempotent**: conversation ids plus content hashes drive the work, so runs can be interrupted, resumed, retried and reprocessed safely
- **Off by default**: `knowledgeEnabled` gates commands and background work
- **Observatory constitution**: the personal vault is treated as an observatory over written traces, not a model of the person. Three epistemic layers (trace / garden / horizon), assistant text never counted as evidence, clinical and essentializing language held back for review, interpretations that can be retired, and commands that point away from the archive (challenge a story, open horizon, show me something I forgot, enough analysis)
- **Plugin orchestration**: per-vault capability discovery (plugins are vault-local in Obsidian) so the destination vault decides which optional enhancements a note gets. Canonical Markdown is identical everywhere; Dataview/Tasks/Templater/QuickAdd/Canvas/Iconize/daily notes are additive only. Includes an in-process `knowledgeApi` for Local REST API / MCP callers
- See `docs/chatgpt-knowledge-import.md`, `docs/observatory-constitution.md`, `docs/plugin-integrations.md` and `src/Services/Knowledge/CLAUDE.md`

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
- `src/Services/` - Service implementations + `Adapters/` and `Knowledge/` subdirectories
- `src/Views/` - UI components and modals
- `src/Models/` - TypeScript interfaces
- `src/Types/` - AI service type definitions
- `src/Utilities/` - Pure helper functions (well-tested)

## Cross-cutting Documentation

- **[docs/development.md](docs/development.md)** - Build process, tooling, esbuild setup
- **[docs/message-flow.md](docs/message-flow.md)** - Complete flow from user input to AI response
- **[docs/chatgpt-knowledge-import.md](docs/chatgpt-knowledge-import.md)** - Importing ChatGPT history into a multi-vault knowledge system
- **[docs/observatory-constitution.md](docs/observatory-constitution.md)** - The epistemic rules of the personal vault and where each one is implemented
- **[docs/plugin-integrations.md](docs/plugin-integrations.md)** - Per-vault plugin capability detection, what each integration does, and what remains when a plugin disappears

## Key Design Patterns

1. **Constructor Injection** - Dependencies passed via ServiceContainer; never instantiate services directly outside `ServiceContainer.create()`
2. **Adapter Pattern** - `AiProviderService` uses provider-specific adapters (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, LM Studio, Z.AI) implementing `ProviderAdapter` interface
3. **Frontmatter-driven config** - Per-note settings override globals; merged at runtime by SettingsService
4. **Streaming responses** - Real-time AI output via Vercel AI SDK with line-boundary buffering and platform-specific handling (desktop Node.js vs mobile Web API)
5. **Link context injection** - Wiki links `[[Note Name]]` are resolved and content injected into prompts
6. **Command Handler Interface** - Commands implement `CommandHandler` with metadata; registered via `CommandRegistrar`
7. **Agent system** - Agent files (markdown with frontmatter + body) override model/temperature and provide system prompts; resolved at runtime via `agent` frontmatter field
8. **Ingestion adapters** - The knowledge importer depends only on `NormalizedConversation`; export, inbox, live capture and source archive are interchangeable adapters (`src/Services/Knowledge/Sources/`)
9. **Managed blocks** - Generated knowledge lives between `<!-- chatgpt-md:auto:start id=... -->` markers so human-authored content is never overwritten
10. **Epistemic layers** - Every knowledge unit is a trace (recorded), garden (provisional interpretation) or horizon (possibility); the layer decides the note's caveat, frontmatter and review date
11. **Deterministic guards** - `src/Utilities/EpistemicGuards.ts` enforces what the prompt asks for: provenance is computed from the transcript, and clinical or essentializing language is capped below the auto-file threshold
12. **Per-vault capabilities** - Plugins are vault-local, so `PluginCapabilityRegistry` builds one cached profile per vault and `VaultEnhancementService` applies only what the *destination* vault can use. No optional plugin is ever load-bearing

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

The prefix determines which adapter handles the request in `AiProviderService`. OpenAI `search-preview` models must use the OpenAI chat-completions factory (`provider.chat(...)`) because the default Responses API path can return `Model not found` for those IDs.
