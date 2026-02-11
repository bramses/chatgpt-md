# Services Layer

All service implementations following single responsibility principle. Services receive dependencies via constructor injection from `ServiceContainer`.

## AI Provider Architecture

### AiProviderService.ts

**Unified AI provider service using adapter pattern.** Replaces the old `BaseAiService` + 6 individual provider services.

Key responsibilities:

- `callAiAPI()` - Main API call method (streaming and non-streaming)
- `inferTitle()` - Generate title from conversation
- `fetchAvailableModels()` - Get models from any provider
- `stopStreaming()` - Abort in-progress streams

Uses Vercel AI SDK (`ai` package) with provider factories:

- `createOpenAI` - OpenAI
- `createAnthropic` - Anthropic
- `createGoogleGenerativeAI` - Gemini
- `createOpenRouter` - OpenRouter
- `createZhipu` - Z.AI
- `createOpenAICompatible` - Ollama, LM Studio

### Adapters/ Subdirectory

See `Adapters/CLAUDE.md` for provider-specific adapter documentation.

## Message Processing

### MessageService.ts

**Core message parsing and manipulation**

Key methods:

- `splitMessages(text)` - Split by `<hr class="__chatgpt_plugin">`
- `extractRoleAndMessage(message)` - Parse `role::assistant` format
- `findLinksInMessage(message)` - Find `[[Wiki]]` and `[Markdown](links)`
- `removeYAMLFrontMatter(note)` - Strip YAML section
- `removeCommentsFromMessages(message)` - Filter comment blocks (`%% ... %%`)

### StreamingHandler.ts

**Handles real-time streaming to editor**

- **Line-boundary flushing**: Only flushes up to the last `\n` to prevent cursor offset race conditions during markdown re-rendering
- **Safety valve**: `MAX_BUFFER_SIZE` (10KB) forces flush even without newlines to prevent unbounded buffer growth
- **`forceFlush()`**: Called on stream end to write remaining partial line
- Cursor position management
- Abort handling via AbortController
- Platform-specific: desktop uses Node.js streams, mobile uses fetch

## Editor Operations

### EditorService.ts

**Orchestrates all editor operations**

Main responsibilities:

- `getMessagesFromEditor()` - Extract and parse messages
- `processResponse()` - Insert AI response into editor
- `getFrontmatter()` - Get merged frontmatter + settings
- `createNewChatFromTemplate()` - Template-based chat creation
- `createNewChatWithHighlightedText()` - Chat from selection
- `clearChat()` - Remove messages, keep frontmatter

## API Layer

### ApiService.ts

**HTTP request handling**

- `makeGetRequest()` - Non-streaming GET requests
- `createFetchAdapter()` - Custom fetch for AI SDK (handles Node.js vs browser)
- `setAbortController()` / `stopStreaming()` - Stream control
- Uses `requestStream.ts` on desktop (Node.js http/https modules)
- Falls back to native `fetch()` on mobile

### ApiAuthService.ts

**API key management**

`getApiKey(settings, providerType)` - Returns appropriate key based on provider.

### requestStream.ts

**Node.js HTTP streaming utility**

- Handles streaming responses on desktop Obsidian
- Works with Node.js `http` and `https` modules
- Falls back to regular fetch on mobile

## Configuration

### FrontmatterManager.ts

**YAML frontmatter handling**

- Parse note frontmatter
- Merge with global settings (frontmatter takes precedence)
- Support service-specific URLs

Model prefix parsing:

- `ollama@model` → Ollama
- `openrouter@model` → OpenRouter
- `lmstudio@model` → LM Studio
- `zai@model` → Z.AI
- `anthropic@model` → Anthropic
- `gemini@model` → Gemini
- No prefix → OpenAI (default)

### SettingsService.ts

**Plugin settings management** (now includes frontmatter operations merged from FrontmatterService)

- `loadSettings()` / `saveSettings()` - Persistence
- `migrateSettings()` - Version upgrades via SettingsMigration.ts
- `getSettings()` - Provide settings to other services
- `getFrontmatter(view)` - Get merged frontmatter config with full priority chain (defaultConfig < defaultFrontmatter < settings < agentFrontmatter < noteFrontmatter)
- `updateFrontmatterField(editor, key, value)` - Update a field in note frontmatter
- `generateFrontmatter()` - Generate frontmatter for new chats using data-driven `PROVIDER_FRONTMATTER_FIELDS` mapping
- `resolveAgentFrontmatter()` - Private method that resolves agent by name from note's `agent` field, merges agent frontmatter and attaches `_agentSystemMessage` from agent body
- `setAgentService()` - Late-binding for AgentService (same pattern as TemplateService)

### SettingsMigration.ts

**Handles settings version upgrades**

- Renames deprecated fields
- Adds new defaults
- Preserves user customizations
- Runs automatically on plugin load

### DefaultConfigs.ts

**Default configuration values for each provider**

- OpenAI defaults
- OpenRouter defaults
- Anthropic defaults
- Gemini defaults
- Ollama defaults
- LM Studio defaults

## Tool Services (v3.0)

### ToolService.ts

**Orchestrates tool calling with approval workflow**

- `getToolsForRequest()` - Get enabled tools for AI request
- `handleToolCalls()` - Process AI tool call requests
- `processToolResults()` - Format results for continuation

Coordinates VaultSearchService and WebSearchService with approval modals.

### ToolSupportDetector.ts

**Whitelist-based tool support detection**

- `isModelWhitelisted()` - Check if model supports tools

Tool calling is only available for whitelisted models (configurable in settings).

### VaultSearchService.ts

**Vault operations**

- `searchVault()` - Full-text search across vault (multi-word OR search)
- `readFiles()` - Read specific files with user approval

### WebSearchService.ts

**Web search via Brave API**

- `search()` - Execute web search
- Supports custom provider endpoints
- 1,000 free queries/month on Brave API

### WhitelistValidator.ts

**Model whitelist validation utilities**

## Agent Service (v3.1)

### AgentService.ts

**Agent file CRUD and resolution**

- `getAgentFiles(settings)` - List all `.md` files in the configured agent folder
- `readAgent(file)` - Parse agent file into `AgentData` (frontmatter + body)
- `resolveAgentByName(name, settings)` - Find and parse agent by basename
- `createAgentFile(name, model, temperature, message, settings)` - Create new agent file with frontmatter (model, temperature, stream) and body (system prompt)
- Private helpers: `extractBody()` strips YAML frontmatter, `buildAgentFrontmatter()` generates YAML

**Agent file format**:

```markdown
---
model: gpt-4o
temperature: 0.7
stream: true
---
You are a helpful coding assistant specializing in TypeScript...
```

Dependencies: `App`, `FileService`, `FrontmatterManager`

## Utility Services

### FileService.ts

- Read file contents
- Get files by path or title
- Folder navigation

### TemplateService.ts

- Load chat templates from configured folder
- Apply to new notes
- Merge frontmatter

### NotificationService.ts

- Show Obsidian notices
- Platform-aware (Notice vs status bar for mobile)

### ErrorService.ts

- Process API errors
- Map HTTP codes to messages
- User-friendly error display
