# Provider Adapters

Provider-specific adapters implementing the `ProviderAdapter` interface. Each adapter encapsulates provider-specific logic, allowing `AiProviderService` to work uniformly with all providers.

## Architecture

The adapter pattern enables:

- **Consistent API** across all AI providers
- **Easy addition** of new providers
- **Provider-specific behavior** (auth, endpoints, model listing)
- **Tool calling support** where available

## ProviderAdapter.ts

**Interface and type definitions**

### ProviderType

```typescript
type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "zai";
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
- `getSystemMessageRole()` - "system" or "developer" (OpenAI uses "developer")
- `supportsSystemField()` - Anthropic: true (dedicated system field), others: false
- `supportsToolCalling()` - Tool calling support
- `requiresApiKey()` - Local providers (Ollama, LM Studio): false
- `extractModelName(modelId)` - Strip provider prefix
- `getApiPathSuffix()` - API path suffix for chat completions

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
- `getApiPathSuffix()` → "/v1" (default for most OpenAI-compatible providers)

## Adapter Implementations

### OpenAIAdapter.ts

- Default URL: `https://api.openai.com`
- System role: `"developer"` (OpenAI-specific for GPT-4+)
- Auth: `Authorization: Bearer {key}`
- Uses Vercel AI SDK `createOpenAI()`

### AnthropicAdapter.ts

- Default URL: `https://api.anthropic.com`
- `supportsSystemField()` → true (dedicated system field in API)
- Auth: `x-api-key: {key}`, `anthropic-version: 2023-06-01`
- Uses Vercel AI SDK `createAnthropic()`

### GeminiAdapter.ts

- Default URL: `https://generativelanguage.googleapis.com`
- Auth: API key in URL query parameter
- Uses Vercel AI SDK `createGoogleGenerativeAI()`

### OllamaAdapter.ts

- Default URL: `http://localhost:11434`
- `requiresApiKey()` → false
- Fetches models from `/api/tags`
- Uses Vercel AI SDK `createOpenAICompatible()`

### LmStudioAdapter.ts

- Default URL: `http://localhost:1234`
- `requiresApiKey()` → false
- OpenAI-compatible API
- Uses Vercel AI SDK `createOpenAICompatible()`

### OpenRouterAdapter.ts

- Default URL: `https://openrouter.ai`
- `getApiPathSuffix()` → "/api/v1" (OpenRouter's unique structure)
- Auth: `Authorization: Bearer {key}`
- Prefixes models with `openrouter@`
- Final endpoints: `/api/v1/chat/completions`, `/api/v1/models`
- Uses Vercel AI SDK `createOpenRouter()`

### ZaiAdapter.ts

- Default URL: `https://api.z.ai`
- Uses `createOpenAICompatible` from AI SDK
- `getApiPathSuffix(url)` → `/api/paas/v4` (Standard mode) or `/api/anthropic/v1` (Coding Plan mode)
- Supports two API modes based on URL path:
  - Standard API: Uses `/api/paas/v4` path
  - Coding Plan (Anthropic-compatible): Uses `/api/anthropic/v1` path
- Auth: `Authorization: Bearer {key}`
- No models endpoint - returns known models directly:
  - GLM-4.5, GLM-4.6, GLM-4.6V, GLM-4.6V-Flash, GLM-4.6V-FlashX, GLM-4.7, GLM-4.7-Flash
- Prefixes models with `zai@`

## Adding a New Provider

1. Create new adapter extending `BaseProviderAdapter`
2. Override provider-specific methods (URL, auth headers, model fetching)
3. Add to `ProviderType` union
4. Add to `AiProviderService` provider selection logic
5. Add default configuration to `DefaultConfigs.ts`
6. Add to settings UI in `ChatGPT_MDSettingsTab.ts`
