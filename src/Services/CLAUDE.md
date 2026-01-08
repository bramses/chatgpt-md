# Services Layer

All service implementations following single responsibility principle.

## v3.0.0 Updates

**Refactored Tool Calling Services**: Tool services split into focused, composable components:

- `ToolService.ts` (~537 lines) - Pure orchestration: approval workflow, result processing, tool execution
- `ToolRegistry.ts` (~90 lines) - Tool registration and lookup (from 769-line ToolService)
- `VaultSearchService.ts` (~175 lines) - Vault operations: searchVault, readFiles
- `WebSearchService.ts` (~169 lines) - Web search: Brave API, custom endpoints

**Benefits:**
- 30% reduction in ToolService size (769 → 537 lines)
- Each service under 200 lines with single responsibility
- Maintains three-layer human-in-the-loop approval workflow
- Zero breaking changes to public API
- All services independently testable

All AI services updated to support tool calling with consistent interface.

## Service Architecture

### Base Classes

**BaseAiService** (AiService.ts) - Abstract base for all AI services

Implements `IAiApiService` interface:

- `callAIAPI()` - Main API call method
- `inferTitle()` - Generate title from conversation

Subclasses must implement:

- `serviceType` - Service identifier
- `getSystemMessageRole()` - Role for system messages
- `supportsSystemField()` - Whether API supports system field

Each service has `DEFAULT_*_CONFIG` with defaults for model, temperature, max_tokens, etc.

## Message Processing

### MessageService.ts

**Core message parsing and manipulation**

Key methods:

- `splitMessages(text)` - Split by `<hr class="__chatgpt_plugin">`
- `extractRoleAndMessage(message)` - Parse `role::assistant` format
- `findLinksInMessage(message)` - Find `[[Wiki]]` and `[Markdown](links)`
- `removeYAMLFrontMatter(note)` - Strip YAML section
- `removeCommentsFromMessages(message)` - Filter `=begin-chatgpt-md-comment` blocks

Link detection:

- Matches `[[Title]]` and `[Text](path)`
- Skips http:// and https:// URLs
- Returns unique links only

## Editor Operations

### EditorService.ts

**Orchestrates all editor operations**

Dependencies: FileService, EditorContentService, MessageService, TemplateService, FrontmatterService

Main responsibilities:

- `getMessagesFromEditor()` - Extract and parse messages
- `processResponse()` - Insert AI response into editor
- `getFrontmatter()` - Get merged frontmatter + settings
- `moveCursorToEnd()` / cursor positioning
- `createNewChatFromTemplate()` - Template-based chat creation
- `createNewChatWithHighlightedText()` - Chat from selection
- `clearChat()` - Remove messages, keep frontmatter
- `addHorizontalRule()` - Insert message separator

## API Layer

### ApiService.ts

**HTTP request handling**

Methods:

- `streamSSE()` - Streaming Server-Sent Events
- `makeApiRequest()` - Non-streaming requests
- Uses `requestStream()` on desktop (Node.js http/https)
- Falls back to `fetch()` on mobile

Handles abort signals and error states.

### ApiAuthService.ts

**API key management**

`getApiKey(settings, serviceType)` - Returns appropriate key:

- `AI_SERVICE_OPENAI` → settings.apiKey
- `AI_SERVICE_OPENROUTER` → settings.openrouterApiKey
- `AI_SERVICE_ANTHROPIC` → settings.anthropicApiKey
- `AI_SERVICE_GEMINI` → settings.geminiApiKey

`isValidApiKey(apiKey)` - Validates format (not empty/null)

### ApiResponseParser.ts

**Parse API responses**

Handles different formats per service:

- OpenAI: `choices[0].delta.content`
- Ollama: `message.content`
- OpenRouter: Similar to OpenAI
- Anthropic: `content[0].text`
- Gemini: `candidates[0].content.parts[0].text`

Detects truncation: `finish_reason: 'length'`

### requestStream.ts

**Custom streaming for desktop**

Desktop:

- Dynamic imports: `http`, `https`, `url` modules
- Creates Node.js HTTP request directly
- Bypasses CORS restrictions
- Converts to Web Streams API

Mobile:

- Falls back to `fetch()`
- Subject to CORS policies

Why: Enables local services (Ollama, LM Studio) on desktop without CORS issues.

## Configuration

### FrontmatterService.ts & FrontmatterManager.ts

**YAML frontmatter handling**

Responsibilities:

- Parse note frontmatter
- Merge with global settings (frontmatter takes precedence)
- Support service-specific URLs: `openaiUrl`, `openrouterUrl`, `ollamaUrl`, `lmstudioUrl`, `anthropicUrl`, `geminiUrl`
- Extract model and determine AI service from model prefix

Model prefix parsing:

- `ollama@model` → AI_SERVICE_OLLAMA
- `openrouter@model` → AI_SERVICE_OPENROUTER
- `lmstudio@model` → AI_SERVICE_LMSTUDIO
- `anthropic@model` → AI_SERVICE_ANTHROPIC
- `gemini@model` → AI_SERVICE_GEMINI
- No prefix → AI_SERVICE_OPENAI (default)

### SettingsService.ts

**Plugin settings management**

Methods:

- `loadSettings()` - Load from Obsidian data
- `saveSettings()` - Persist to disk
- `migrateSettings()` - Uses SettingsMigration.ts
- `addSettingTab()` - Register UI tab
- `getSettings()` - Provide settings to other services

## AI Service Implementations

### OpenAiService.ts

- Supports OpenAI API (`/v1/chat/completions`)
- System messages via `role: "system"`
- Default model: `gpt-5-mini`

### OllamaService.ts

- Local Ollama (`/api/chat`)
- Default URL: `http://localhost:11434`
- No API key required

### OpenRouterService.ts

- OpenRouter proxy (`/api/v1/chat/completions`)
- Access to multiple providers
- Requires OpenRouter API key

### LmStudioService.ts

- Local LM Studio (`/v1/chat/completions`)
- Default URL: `http://localhost:1234`
- No API key required

### AnthropicService.ts

- Direct Anthropic API (`/v1/messages`)
- Different message format (system field)
- Requires Anthropic API key

### GeminiService.ts

- Google Gemini API
- Different request/response structure
- Requires Gemini API key

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
- Error/warning/info messages
- Platform-aware

### ErrorService.ts

- Process API errors
- Map HTTP codes to messages
- User-friendly error display
