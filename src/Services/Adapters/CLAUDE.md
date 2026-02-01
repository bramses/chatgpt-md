# Provider Adapters

Provider-specific adapters implementing the `ProviderAdapter` interface.

## Architecture

Each adapter encapsulates provider-specific logic, allowing `AiProviderService` to work uniformly with all providers.

## ProviderAdapter.ts

**Interface and type definitions**

### ProviderType

```typescript
type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot";
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

### CopilotAdapter.ts

- **Hybrid adapter**: Uses `@github/copilot-sdk` instead of Vercel AI SDK
- Default URL: `https://api.githubcopilot.com` (handled by SDK internally via CLI)
- `requiresApiKey()` → false (uses CLI-based OAuth)
- `supportsToolCalling()` → false (Copilot has built-in tools, bridging can be added later)
- Desktop only - hidden on mobile (CLI not available)
- Falls back to known models (gpt-4.1, gpt-4o, claude-sonnet-4, o3-mini)
- Prefixes models with `copilot@`

**Prerequisites**:

1. Install Copilot CLI: https://docs.github.com/en/copilot/github-copilot-in-the-cli
2. Authenticate: `copilot auth login`

Or via GitHub CLI:

1. Install GitHub CLI: https://cli.github.com/
2. Install Copilot extension: `gh extension install github/gh-copilot`
3. Authenticate: `gh auth login`

**SDK API (2026 best practices)**:

Client lifecycle:

```typescript
const client = new CopilotClient({ autoStart: true, cliPath: "copilot" });
await client.start(); // Must call before createSession
// ... use client
await client.stop(); // Always cleanup
```

Session management:

```typescript
const session = await client.createSession({
  model: "gpt-4.1",
  streaming: true,
  systemMessage: { mode: "append", content: "..." }, // "append" preserves guardrails
});
// ... use session
await session.destroy(); // Always cleanup
```

Event handling (single callback pattern):

```typescript
const unsubscribe = session.on((event) => {
  switch (event.type) {
    case "assistant.message.delta":
      // Streaming chunk: event.data.deltaContent
      break;
    case "assistant.message":
      // Final message: event.data.content
      break;
    case "session.idle":
      // Processing complete
      unsubscribe();
      break;
    case "session.error":
      // Error: event.data.message
      break;
  }
});
await session.send({ prompt: "..." });
```

Non-streaming:

```typescript
const response = await session.sendAndWait({ prompt: "..." }); // Returns string
```

**Key differences from other adapters**:

- Session-based API via JSON-RPC instead of REST API
- Event-based streaming with discriminated union event types
- Always use try-finally for cleanup (client.stop, session.destroy)
- System messages use "append" mode to preserve safety guardrails
