# Provider Adapters

Provider-specific adapters implementing the `ProviderAdapter` interface.

## Architecture

Each adapter encapsulates provider-specific logic, allowing `AiProviderService` to work uniformly with all providers.

## ProviderAdapter.ts

**Interface and type definitions**

### ProviderType

```typescript
type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio";
```

### AiProviderConfig

Unified configuration for all providers:

```typescript
interface AiProviderConfig {
  provider: ProviderType;
  model: string;
  maxTokens: number;
  temperature: number;
  stream: boolean;
  url: string;
  title: string;
  system_commands: string[] | null;
  tags: string[] | null;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}
```

### ProviderAdapter Interface

Contract each adapter must implement:

- `type` - Provider identifier
- `displayName` - Human-readable name
- `getDefaultBaseUrl()` - Default API endpoint
- `getAuthHeaders(apiKey)` - Authentication headers
- `fetchModels(url, apiKey, settings, makeGetRequest)` - Model listing
- `getSystemMessageRole()` - "system" or "developer"
- `supportsSystemField()` - Anthropic: true, others: false
- `supportsToolCalling()` - Tool calling support
- `requiresApiKey()` - Local providers: false
- `extractModelName(modelId)` - Strip provider prefix

## BaseProviderAdapter.ts

**Abstract base class with common functionality**

Default implementations:
- `getSystemMessageRole()` → "system"
- `supportsSystemField()` → false
- `supportsToolCalling()` → true
- `requiresApiKey()` → true
- `extractModelName()` - Remove provider prefix
- `validateApiKey()` - Check key presence
- `handleFetchError()` - Consistent error logging

## Adapter Implementations

### OpenAIAdapter.ts

- Default URL: `https://api.openai.com`
- System role: `"developer"` (OpenAI-specific)
- Auth: `Authorization: Bearer {key}`

### AnthropicAdapter.ts

- Default URL: `https://api.anthropic.com`
- `supportsSystemField()` → true (dedicated system field)
- Auth: `x-api-key: {key}`, `anthropic-version: 2023-06-01`

### GeminiAdapter.ts

- Default URL: `https://generativelanguage.googleapis.com`
- Auth: API key in URL query parameter

### OllamaAdapter.ts

- Default URL: `http://localhost:11434`
- `requiresApiKey()` → false
- Fetches models from `/api/tags`

### LmStudioAdapter.ts

- Default URL: `http://localhost:1234`
- `requiresApiKey()` → false
- OpenAI-compatible API

### OpenRouterAdapter.ts

- Default URL: `https://openrouter.ai`
- Auth: `Authorization: Bearer {key}`
- Prefixes models with `openrouter@`
