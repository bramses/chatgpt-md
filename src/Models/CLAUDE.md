# Configuration Models & Types

TypeScript interfaces for settings and configuration.

## Config.ts

Main configuration interfaces and defaults.

### ChatGPT_MDSettings

**Main settings interface** extending:

- ApiKeySettings
- FolderSettings
- ChatBehaviorSettings
- FormattingSettings
- OpenAIFrontmatterSettings
- OpenRouterFrontmatterSettings
- OllamaFrontmatterSettings
- LmStudioFrontmatterSettings
- AnthropicFrontmatterSettings
- GeminiFrontmatterSettings

### API Key Settings

```typescript
interface ApiKeySettings {
  apiKey: string; // OpenAI
  openrouterApiKey: string; // OpenRouter
  anthropicApiKey: string; // Anthropic
  geminiApiKey: string; // Gemini
}
```

### Folder Settings

```typescript
interface FolderSettings {
  chatFolder: string; // Path for chat files
  chatTemplateFolder: string; // Path for templates
}
```

### Chat Behavior Settings

```typescript
interface ChatBehaviorSettings {
  stream: boolean; // Stream responses
  generateAtCursor: boolean; // Insert at cursor vs end
  autoInferTitle: boolean; // Auto title after 4 messages
  pluginSystemMessage: string; // Context for LLMs
}
```

Default `pluginSystemMessage`:

> You're chatting with a user in Obsidian, a knowledge management system...

### Formatting Settings

```typescript
interface FormattingSettings {
  dateFormat: string; // For timestamp filenames
  headingLevel: number; // Message heading level (1-6)
  inferTitleLanguage: string; // Language for title inference
}
```

Defaults:

- `dateFormat: "YYYYMMDDhhmmss"`
- `headingLevel: 3`
- `inferTitleLanguage: "English"`

### Provider-Specific Settings

Each AI service has dedicated settings:

**OpenAIFrontmatterSettings**:

- openaiDefaultModel
- openaiDefaultTemperature
- openaiDefaultTopP
- openaiDefaultMaxTokens
- openaiDefaultPresencePenalty
- openaiDefaultFrequencyPenalty
- openaiUrl

**AnthropicFrontmatterSettings**:

- anthropicDefaultModel
- anthropicDefaultTemperature
- anthropicDefaultMaxTokens
- anthropicUrl

Similar patterns for: OpenRouter, Ollama, LmStudio, Gemini

### Frontmatter Override

All settings can be overridden per-note via YAML frontmatter:

```yaml
---
model: ollama@llama3.2
temperature: 0.7
max_tokens: 2000
stream: true
system_commands: ["You are a helpful assistant."]
openaiUrl: https://api.openai.com
ollamaUrl: http://localhost:11434
---
```

**Merge priority**: Frontmatter > Global Settings

## Message.ts

**Message interface** for chat messages:

```typescript
interface Message {
  role: string; // "user", "assistant", "system", "developer"
  content: string; // Message text
}
```

Roles defined in `Constants.ts`:

- `ROLE_USER = "user"`
- `ROLE_ASSISTANT = "assistant"`
- `ROLE_SYSTEM = "system"`
- `ROLE_DEVELOPER = "developer"`

## Constants.ts

Not in Models/ but contains key configuration constants:

### Service Identifiers

```typescript
AI_SERVICE_OPENAI = "openai";
AI_SERVICE_OLLAMA = "ollama";
AI_SERVICE_OPENROUTER = "openrouter";
AI_SERVICE_LMSTUDIO = "lmstudio";
AI_SERVICE_ANTHROPIC = "anthropic";
AI_SERVICE_GEMINI = "gemini";
```

### API Endpoints

```typescript
API_ENDPOINTS = {
  openai: "/v1/chat/completions",
  openrouter: "/api/v1/chat/completions",
  ollama: "/api/chat",
  lmstudio: "/v1/chat/completions",
  anthropic: "/v1/messages",
  gemini: "/v1beta/models/{model}:generateContent",
};
```

### Message Format

- `ROLE_IDENTIFIER = "role::"` - Role prefix in editor
- `HORIZONTAL_LINE_MD = '<hr class="__chatgpt_plugin">'` - Message separator
- `COMMENT_BLOCK_START = "=begin-chatgpt-md-comment"`
- `COMMENT_BLOCK_END = "=end-chatgpt-md-comment"`

### Link Detection

- `WIKI_LINKS_REGEX = /\[\[([^\][]+)\]\]/g`
- `MARKDOWN_LINKS_REGEX = /\[([^\]]+)\]\(([^()]+)\)/g`

### Error Messages

- `CHAT_ERROR_MESSAGE_401` - Auth issues
- `CHAT_ERROR_MESSAGE_404` - Wrong URL/model
- `CHAT_ERROR_MESSAGE_NO_CONNECTION` - Network issues
- `TRUNCATION_ERROR_INDICATOR` - Response truncated

### Other Constants

- `DEFAULT_HEADING_LEVEL = 3`
- `MIN_AUTO_INFER_MESSAGES = 4`
- `DEFAULT_DATE_FORMAT = "YYYYMMDDhhmmss"`
- `FETCH_MODELS_TIMEOUT_MS = 6000`

## Settings Migration

**SettingsMigration.ts** handles version upgrades:

- Renames deprecated fields
- Adds new defaults
- Preserves user customizations
- Runs automatically on plugin load

Common migrations:

- Old `url` → service-specific URLs (`openaiUrl`, etc.)
- New provider additions
- Default model updates
