# AGENTS.md

AI coding-agent instructions for **chatgpt-md**.

## Project overview

`chatgpt-md` is an Obsidian community plugin that brings LLM workflows into markdown notes. It supports:

- Chat interactions directly inside Obsidian notes.
- Multiple providers: OpenAI, OpenRouter, Anthropic, Gemini, Ollama, LM Studio, Z.AI, and compatible APIs.
- Per-note configuration through YAML frontmatter.
- Streaming responses.
- Human-approved AI tool calls for vault and web search workflows.

The plugin is TypeScript, bundled by esbuild, and runs inside the Obsidian plugin runtime.

## Validation commands

Use npm for validation unless the project explicitly changes package-manager policy.

```bash
npm run build
npm test -- --runInBand
npm run lint
```

Current lint may report complexity/length warnings. Do not treat existing warnings as task blockers unless your change adds new warnings.

## Current architecture

### Entry point

- `src/main.ts`
  - Creates the `ServiceContainer`.
  - Loads and migrates settings.
  - Registers commands.
  - Starts background model initialization.

### Dependency wiring

- `src/core/ServiceContainer.ts`
  - Explicit constructor-injection container.
  - Creates services once per plugin load.
  - Exposes an `aiProviderService()` factory for per-request AI provider instances.
  - Do **not** add string-based service lookup or a framework-style DI system.

### Commands

- `src/Commands/*Handler.ts`
  - Command handlers orchestrate services.
  - Registration helpers live in `src/Commands/CommandRegistrar.ts`.
  - Command contracts live in `src/Commands/CommandHandler.ts`.

### Services

- `src/Services/Providers/ProviderRegistry.ts`
  - Operational source of truth for provider IDs, defaults, credentials, URLs, adapters, and AI SDK factories.
  - Keep user-facing settings copy in the settings schema and protocol differences in adapters.

- `src/Services/AiProviderService.ts`
  - Current facade for AI calls, streaming, provider selection, title inference, and tool-call handling.
  - Large; prefer incremental extraction of pure helpers over rewrites.

- `src/Services/Adapters/*Adapter.ts`
  - Provider-specific behavior such as model listing, auth headers, system-message role, API path suffix, and tool support.
  - New provider-specific API differences belong here.

- `src/Services/Knowledge/*`
  - ChatGPT history importer: source archive, semantic extraction, multi-vault routing, durable note merging.
  - Opt-in via `knowledgeEnabled`; no startup work and no commands when disabled.
  - Read `src/Services/Knowledge/CLAUDE.md` and `docs/observatory-constitution.md` before changing anything here. The invariants listed there (archive first, manifest is the source of truth, human content wins, evidence merges by unit id, projects stay projects) are behavioral contracts covered by tests.
  - Plugin integrations are per vault (`PluginCapabilityRegistry`, `PluginIntegrationService`, `VaultEnhancementService`). Never ask "is Dataview installed?" globally - ask `has(vaultId, capability)`. Enhancements are applied after canonical Markdown and must never change what the note means. See `docs/plugin-integrations.md`.
  - The personal vault additionally follows an epistemic constitution: assistant text is never evidence about the user, clinical/essentializing language is held back for review, interpretations carry a lifecycle and can be retired, and several commands exist to reduce interpretation rather than increase it. `Observatory.test.ts` and `EpistemicGuards.test.ts` are the regression suite for it.

- `src/Services/SettingsService.ts`
  - Loads/saves plugin settings.
  - Runs migrations.
  - Resolves effective frontmatter config with global settings and agent frontmatter.

- `src/Services/ToolService.ts`
  - Registers tool definitions.
  - Executes tools after approval.
  - Formats/filters tool results.
  - Preserve human approval flows when editing this area.

- `src/Services/MessageService.ts`, `EditorService.ts`, `FileService.ts`, `TemplateService.ts`
  - Editor/message/file/template coordination.

### Views and utilities

- `src/Views/*`
  - Obsidian modals and settings UI.
  - Keep business logic out of views when practical.

- `src/Utilities/*`
  - Stateless helpers. Prefer adding pure behavior here when no service state is needed.

### Models and types

- `src/Models/*`
  - Internal config/message/tool models.

- `src/Types/*`
  - Cross-cutting service/provider contracts.

## Important implementation rules

### DRY

Operational provider metadata is centralized in `ProviderRegistry`. Search before changing provider behavior because user-facing settings fields, migrations, documentation, and adapter-specific protocol logic remain separate concerns.

```bash
rg "openai|anthropic|gemini|openrouter|ollama|lmstudio|zai" src
```

### KISS

- Prefer small pure helper extraction over large rewrites.
- Keep command handlers thin.
- Keep `ServiceContainer` explicit.
- Do not introduce a new DI framework or generic plugin system unless explicitly requested.

### YAGNI

- Do not build broad abstractions for hypothetical providers/tools.
- Add the minimum structure needed for the current change.
- Avoid heavy dependencies for simple parsing, formatting, or logging.

## Adding a command

1. Add/update a handler in `src/Commands/`.
2. Implement the appropriate interface from `src/Commands/CommandHandler.ts`.
3. Register it in `src/main.ts` using `CommandRegistrar` where possible.
4. Keep command logic limited to orchestration and user-visible status.

## Adding provider behavior today

The project uses a unified `AiProviderService`, a provider registry, and provider adapters:

1. Add an adapter in `src/Services/Adapters/` implementing `ProviderAdapter`.
2. Add the provider ID/type in `src/Constants.ts`.
3. Add defaults in `src/Services/DefaultConfigs.ts` and persisted fields in `src/Models/Config.ts`.
4. Add one operational definition in `src/Services/Providers/ProviderRegistry.ts`.
5. Add provider-specific settings fields to `src/Views/settingsSchema.ts`.
6. Add/update migrations, docs, routing tests, and registry completeness tests.

## Working with settings/frontmatter

Effective chat config is assembled from multiple layers. Preserve this priority unless explicitly changing behavior:

1. provider defaults
2. default chat frontmatter from settings
3. global plugin settings
4. referenced agent frontmatter/body
5. note frontmatter

When adding settings, update:

- `ChatGPT_MDSettings`
- `DEFAULT_SETTINGS`
- settings UI schema/rendering
- migrations if old data needs conversion
- docs

## Working with tools

Tool calls may expose vault or web data. Never bypass approval modals or approval filtering. Keep tool result formatting deterministic and testable.

## Logging and secrets

- Do not log API keys.
- Avoid logging full prompts or vault content by default.
- Prefer debug-gated logging for request/stream internals.

## Generated files

- `main.js` is a build/release artifact. Do not edit it by hand.
- Do not commit coverage output, `.DS_Store`, logs, or local editor state.

## Spec-Kit

This repository uses the [spec-kit](https://github.com/github/spec-kit) workflow for AI-assisted feature development.
Spec-kit is a convention for structuring feature specs, plans, and tasks in a `.specify/` directory so that AI agents can read and act on them.
This project uses an opinionated local tooling layer to generate the artifacts that live there — the source of truth for the workflow itself is the spec-kit repo linked above.

### `.specify/` directory

| Path | Purpose |
|------|---------|
| `.specify/templates/` | Markdown templates for specs, plans, tasks, and checklists |
| `.specify/memory/` | Long-lived context files (e.g. `constitution.md`) read by agents |
| `.specify/scripts/` | Helper shell scripts for common workflow steps |
| `.specify/hooks.yml` | CI/automation hook definitions |

### How to use it

- Start a new feature: `/speckit-specify` — creates a spec from a template and opens a clarification loop.
- Generate a plan: `/speckit-plan` — converts an approved spec into a structured plan.
- Break into tasks: `/speckit-tasks` — decomposes a plan into trackable tasks.
- Implement: `/speckit-implement` — works through tasks and updates checklists.
