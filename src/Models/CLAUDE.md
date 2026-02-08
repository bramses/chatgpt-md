# Configuration Models & Types

TypeScript interfaces for settings and configuration.

## Config.ts

**Main settings interface**

### ChatGPT_MDSettings

Extends multiple interfaces:

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
- ZaiFrontmatterSettings
- ToolCallingSettings

### Key Setting Groups

**API Keys**:

```typescript
apiKey: string; // OpenAI
openrouterApiKey: string; // OpenRouter
anthropicApiKey: string; // Anthropic
geminiApiKey: string; // Gemini
```

**Folders**:

```typescript
chatFolder: string; // Path for chat files
chatTemplateFolder: string; // Path for templates
```

**Chat Behavior**:

```typescript
stream: boolean; // Stream responses
generateAtCursor: boolean; // Insert at cursor vs end
autoInferTitle: boolean; // Auto title after 4 messages
pluginSystemMessage: string; // Context for LLMs
```

**Tool Calling**:

```typescript
enableToolCalling: boolean; // Master switch
braveSearchApiKey: string; // Brave Search API
customWebSearchUrl: string; // Self-hosted endpoint
maxWebResults: number; // Results to return (1-10)
toolEnabledModels: string; // Whitelist of models
```

### Frontmatter Override

All settings can be overridden per-note:

```yaml
---
model: ollama@llama3.2
temperature: 0.7
max_tokens: 2000
stream: true
system_commands: ["You are a helpful assistant."]
---
```

**Merge priority**: Frontmatter > Global Settings

## Message.ts

**Message interface for chat messages**:

```typescript
interface Message {
  role: string; // "user", "assistant", "system", "developer"
  content: string; // Message text
}
```

## Tool.ts

**Tool definitions for AI function calling**

Describes executable tools:

- `vault_search` - Search vault notes
- `file_read` - Read specific files
- `web_search` - Web search via Brave API

## Constants.ts (in src/)

Key constants used across the codebase:

**Provider Types**:

```typescript
type ProviderType = "openai" | "ollama" | "openrouter" | "lmstudio" | "anthropic" | "gemini" | "zai";
```

**Message Format**:

- `ROLE_IDENTIFIER = "role::"` - Role prefix in editor
- `HORIZONTAL_LINE_MD = '<hr class="__chatgpt_plugin">'` - Message separator
- `COMMENT_BLOCK_START` / `COMMENT_BLOCK_END` - Comment markers

**Link Detection**:

- `WIKI_LINKS_REGEX` - Matches `[[Title]]`
- `MARKDOWN_LINKS_REGEX` - Matches `[Text](path)`

## Types/ Directory

See `src/Types/CLAUDE.md` for AI service interfaces.

## Settings Migration

**SettingsMigration.ts** (in Services/) handles version upgrades:

- Renames deprecated fields
- Adds new defaults
- Preserves user customizations
- Runs automatically on plugin load
