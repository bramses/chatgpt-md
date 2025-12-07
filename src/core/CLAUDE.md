# Core Infrastructure

This directory contains the core architectural components of the plugin.

## ServiceLocator.ts

**Central dependency injection container**

Creates and manages all service instances:

- Instantiates services once at plugin load
- Provides getter methods for all services
- Factory method `getAiApiService(serviceType)` returns appropriate AI service

**Service instantiation order**:

1. NotificationService, ErrorService
2. ApiService, ApiAuthService, ApiResponseParser
3. FileService, FrontmatterManager, EditorContentService
4. MessageService, FrontmatterService, TemplateService
5. EditorService (orchestrates multiple services)
6. SettingsService

**AI service factory**:
Returns service based on type:

- `AI_SERVICE_OPENAI` → OpenAiService
- `AI_SERVICE_OLLAMA` → OllamaService
- `AI_SERVICE_OPENROUTER` → OpenRouterService
- `AI_SERVICE_LMSTUDIO` → LmStudioService
- `AI_SERVICE_ANTHROPIC` → AnthropicService
- `AI_SERVICE_GEMINI` → GeminiService

## CommandRegistry.ts

**Manages all Obsidian commands**

### Main Command: Chat

Location: `registerChatCommand()`

Flow:

1. Get EditorService and settings
2. Parse frontmatter
3. Extract messages from editor via MessageService
4. Move cursor if needed
5. Get appropriate AI service from ServiceLocator
6. Call AI API with messages + config
7. Stream response to editor
8. Optional auto title inference

### Other Commands

- `registerSelectModelCommand()` - Opens model selection modal, fetches fresh models
- `registerAddDividerCommand()` - Adds `<hr class="__chatgpt_plugin">`
- `registerAddCommentBlockCommand()` - Inserts comment block
- `registerStopStreamingCommand()` - Aborts streaming request
- `registerInferTitleCommand()` - Generate title from conversation
- `registerMoveToNewChatCommand()` - Create chat from highlighted text
- `registerChooseChatTemplateCommand()` - Create chat from template
- `registerClearChatCommand()` - Clear messages, keep frontmatter

### Model Initialization

`initializeAvailableModels()`:

- Runs in background on plugin load (non-blocking)
- Fetches models from all configured services in parallel
- 6 second timeout per service
- Cached for instant model selection modal
- Refreshed on-demand when modal opens

### Platform Handling

Desktop: Status bar updates
Mobile: Notice popups
