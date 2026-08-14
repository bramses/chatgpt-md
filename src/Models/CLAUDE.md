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
- TemplateSettings
- ServiceUrlSettings
- WebSearchSettings
- OpenAIFrontmatterSettings
- OpenRouterFrontmatterSettings
- OllamaFrontmatterSettings
- LmStudioFrontmatterSettings
- AnthropicFrontmatterSettings
- GeminiFrontmatterSettings
- ZaiFrontmatterSettings

### Key Setting Groups

**API Keys**:

```typescript
apiKey: string; // OpenAI
openrouterApiKey: string; // OpenRouter
anthropicApiKey: string; // Anthropic
geminiApiKey: string; // Gemini
zaiApiKey: string; // Z.AI
orcarouterApiKey: string; // OrcaRouter
```

**Folders**:

```typescript
chatFolder: string; // Path for chat files
chatTemplateFolder: string; // Path for templates
agentFolder: string; // Path for agent files
```

**Chat Behavior**:

```typescript
stream: boolean; // Stream responses
generateAtCursor: boolean; // Insert at cursor vs end
autoInferTitle: boolean; // Auto title after 4 messages
enableToolCalling: boolean; // Master switch for tools
toolEnabledModels: string; // Whitelist of models (supports wildcards)
debugMode: boolean; // Enable debug logging
pluginSystemMessage: string; // Context for LLMs
```

**Web Search**:

```typescript
webSearchProvider: "brave" | "custom"; // Search provider
webSearchApiKey: string; // API key for search
webSearchApiUrl: string; // Custom endpoint URL
maxWebSearchResults: number; // Results to return (1-10)
```

**Service URLs**:

```typescript
openaiUrl: string;
openrouterUrl: string;
ollamaUrl: string;
lmstudioUrl: string;
anthropicUrl: string;
geminiUrl: string;
zaiUrl: string;
orcarouterUrl: string;
```

### Frontmatter Override

All settings can be overridden per-note:

```yaml
---
model: openai@gpt-4.1-mini
temperature: 0.7
max_tokens: 2000
stream: true
system_commands: ["You are a helpful assistant."]
agent: CodingExpert
---
```

**Merge priority**: defaultConfig < defaultFrontmatter < settings < agentFrontmatter < noteFrontmatter

Agent frontmatter is resolved when note contains `agent: AgentName` field. The agent body becomes `_agentSystemMessage`, which `ChatHandler` prepends as a system message. `AiProviderService` later converts system/developer messages into the AI SDK `instructions` option.

### MergedFrontmatterConfig

Runtime configuration after merging all sources:

```typescript
interface MergedFrontmatterConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  stream: boolean;
  aiService: string; // Runtime: determined from model/url/keys
  url: string; // Runtime: service URL
  system_commands?: string[] | null;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  _agentSystemMessage?: string; // Runtime: agent body
  [key: string]: unknown;
}
```

### DEFAULT_SETTINGS

Default values for all settings, loaded from:

- Constants: `DEFAULT_DATE_FORMAT`, `DEFAULT_HEADING_LEVEL`, `PLUGIN_SYSTEM_MESSAGE`
- DefaultConfigs: Provider-specific defaults (model, temperature, etc.)

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

## Constants

Cross-cutting constants (provider IDs, command IDs, message-format markers, link regexes, error messages, timing) live in `src/Constants.ts`; `src/CLAUDE.md` describes the file's role. Read the source for exact values — they drift from docs.

## Types/ Directory

See `src/Types/CLAUDE.md` for AI service interfaces.

## Settings Migration

**SettingsMigration.ts** (in Services/) handles version upgrades:

- Renames deprecated fields
- Adds new defaults
- Preserves user customizations
- Runs automatically on plugin load
