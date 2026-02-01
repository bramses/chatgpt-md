# Services Layer

All service implementations following single responsibility principle.

## AI Provider Architecture (Refactored)

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
- `createOpenAICompatible` - Ollama, LM Studio

### Adapters/ Subdirectory

Provider-specific adapters implementing `ProviderAdapter` interface:

- `BaseProviderAdapter.ts` - Abstract base with common functionality
- `OpenAIAdapter.ts` - OpenAI API
- `AnthropicAdapter.ts` - Anthropic API (supports system field)
- `GeminiAdapter.ts` - Google Gemini API
- `OllamaAdapter.ts` - Local Ollama (no API key required)
- `LmStudioAdapter.ts` - Local LM Studio (no API key required)
- `OpenRouterAdapter.ts` - OpenRouter proxy

Each adapter defines:

- `type` - Provider identifier (e.g., "openai", "ollama")
- `displayName` - Human-readable name
- `getDefaultBaseUrl()` - Default API endpoint
- `getAuthHeaders()` - Authentication headers
- `fetchModels()` - Model listing implementation
- `requiresApiKey()` - Whether API key is needed

## Message Processing

### MessageService.ts

**Core message parsing and manipulation**

Key methods:

- `splitMessages(text)` - Split by `<hr class="__chatgpt_plugin">`
- `extractRoleAndMessage(message)` - Parse `role::assistant` format
- `findLinksInMessage(message)` - Find `[[Wiki]]` and `[Markdown](links)`
- `removeYAMLFrontMatter(note)` - Strip YAML section
- `removeCommentsFromMessages(message)` - Filter comment blocks

### StreamingHandler.ts

**Handles real-time streaming to editor**

- Buffered text insertion for smooth UX
- Cursor position management
- Abort handling

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
- `createFetchAdapter()` - Custom fetch for AI SDK
- `setAbortController()` / `stopStreaming()` - Stream control
- Uses `requestStream.ts` on desktop (Node.js http/https)
- Falls back to `fetch()` on mobile

### ApiAuthService.ts

**API key management**

`getApiKey(settings, providerType)` - Returns appropriate key based on provider.

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
- `anthropic@model` → Anthropic
- `gemini@model` → Gemini
- No prefix → OpenAI (default)

### SettingsService.ts

**Plugin settings management**

- `loadSettings()` / `saveSettings()` - Persistence
- `migrateSettings()` - Version upgrades via SettingsMigration.ts
- `getSettings()` - Provide settings to other services

### DefaultConfigs.ts

**Default configuration values for each provider**

## Tool Services

### ToolService.ts

**Orchestrates tool calling with approval workflow**

- `getToolsForRequest()` - Get enabled tools for AI request
- `handleToolCalls()` - Process AI tool call requests
- `processToolResults()` - Format results for continuation

### ToolSupportDetector.ts

**Whitelist-based tool support detection**

- `isModelWhitelisted()` - Check if model supports tools

### VaultSearchService.ts

**Vault operations**

- `searchVault()` - Full-text search across vault
- `readFiles()` - Read specific files

### WebSearchService.ts

**Web search via Brave API**

- `search()` - Execute web search
- Supports custom provider endpoints

### WhitelistValidator.ts

**Model whitelist validation utilities**

## Utility Services

### FileService.ts

- Read file contents
- Get files by path or title
- Folder navigation

### TemplateService.ts

- Load chat templates
- Apply to new notes
- Merge frontmatter

### NotificationService.ts

- Show Obsidian notices
- Platform-aware (Notice vs status bar)

### ErrorService.ts

- Process API errors
- Map HTTP codes to messages
- User-friendly error display
