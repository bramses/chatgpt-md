# PROJECT_SPEC: Z.AI Integration

**Issue:** add-z-ai-integration
**Date:** 2026-02-04

---

## 1. Overview

### Purpose
Add Z.AI (Zhipu AI) as a new AI provider for the ChatGPT MD Obsidian plugin, enabling access to GLM (General Language Model) series models.

### Scope
- New provider adapter for Z.AI
- Settings UI for API key and defaults
- Full integration with existing provider architecture
- Support for streaming, tool calling, and frontmatter overrides

### Out of Scope
- Vision model support (GLM-4.5V, GLM-4.6V)
- Audio model support (GLM-ASR)
- Image/video generation
- Advanced features like thinking mode

---

## 2. Technical Specification

### 2.1 Z.AI API Details

| Property | Value |
|----------|-------|
| Base URL | `https://api.z.ai/api/paas/v4` |
| Chat Endpoint | `POST /v1/chat/completions` |
| Models Endpoint | `GET /v1/models` |
| Auth Header | `Authorization: Bearer {API_KEY}` |
| Streaming | SSE (Server-Sent Events) |
| Compatibility | OpenAI SDK compatible |

### 2.2 Request Format

```json
{
  "model": "glm-4.7",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 400,
  "stream": true
}
```

### 2.3 Response Format (Streaming)

```
data: {"id":"1","created":1677652288,"model":"glm-4.7","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
data: {"id":"1","created":1677652288,"model":"glm-4.7","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":2}}
data: [DONE]
```

### 2.4 Models List Response

```json
{
  "data": [
    {"id": "glm-4.7", "object": "model", "owned_by": "zhipuai"},
    {"id": "glm-4.7-flash", "object": "model", "owned_by": "zhipuai"},
    {"id": "glm-4.6", "object": "model", "owned_by": "zhipuai"}
  ]
}
```

---

## 3. Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    ChatGPT MD Plugin                     │
├─────────────────────────────────────────────────────────┤
│  Settings UI (ChatGPT_MDSettingsTab.ts)                 │
│    ├── Z.AI API Key input                               │
│    ├── Z.AI URL input                                   │
│    └── Z.AI Default Model/Temp/MaxTokens                │
├─────────────────────────────────────────────────────────┤
│  Configuration (Config.ts)                              │
│    ├── ApiKeySettings.zaiApiKey                         │
│    ├── ServiceUrlSettings.zaiUrl                        │
│    └── ZaiFrontmatterSettings                           │
├─────────────────────────────────────────────────────────┤
│  AI Provider Service (AiProviderService.ts)             │
│    ├── adapters Map → ZaiAdapter                        │
│    └── getProviderFactory() → createOpenAICompatible    │
├─────────────────────────────────────────────────────────┤
│  ZaiAdapter (ZaiAdapter.ts)                             │
│    ├── type: "zai"                                      │
│    ├── displayName: "Z.AI"                              │
│    ├── getDefaultBaseUrl()                              │
│    ├── getAuthHeaders()                                 │
│    ├── fetchModels()                                    │
│    └── supportsToolCalling()                            │
├─────────────────────────────────────────────────────────┤
│  Vercel AI SDK                                          │
│    └── createOpenAICompatible()                         │
├─────────────────────────────────────────────────────────┤
│                    Z.AI API                             │
│         https://api.z.ai/api/paas/v4                    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

```
User Input → EditorService → FrontmatterManager (parse model prefix)
    ↓
model: "zai@glm-4.7" → provider: "zai", model: "glm-4.7"
    ↓
AiProviderService.callAiAPI()
    ↓
ZaiAdapter.getAuthHeaders() → Authorization: Bearer {key}
    ↓
createOpenAICompatible({ baseURL, apiKey })
    ↓
POST https://api.z.ai/api/paas/v4/v1/chat/completions
    ↓
SSE Stream → StreamingHandler → EditorService → Note
```

---

## 4. File Changes Specification

### 4.1 New Files

#### `src/Services/Adapters/ZaiAdapter.ts`

```typescript
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

interface ZaiModel extends ProviderModelData {
  id: string;
  object: string;
  owned_by: string;
}

export class ZaiAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "zai";
  readonly displayName = "Z.AI";

  getDefaultBaseUrl(): string {
    return "https://api.z.ai/api/paas/v4";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  requiresApiKey(): boolean {
    return true;
  }

  supportsToolCalling(): boolean {
    return true;
  }

  async fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    if (!this.validateApiKey(apiKey)) {
      return [];
    }

    try {
      const headers = this.getAuthHeaders(apiKey!);
      const modelsUrl = url.endsWith('/') ? `${url}v1/models` : `${url}/v1/models`;
      const models = await makeGetRequest(modelsUrl, headers, this.type);

      return models.data
        .filter((model: ZaiModel) => model.id.toLowerCase().includes("glm"))
        .sort((a: ZaiModel, b: ZaiModel) => a.id.localeCompare(b.id))
        .map((model: ZaiModel) => this.prefixModelId(model.id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }
}
```

### 4.2 Modified Files

#### `src/Services/Adapters/ProviderAdapter.ts`

**Line 6** - Add "zai" to ProviderType:
```typescript
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot" | "zai";
```

#### `src/Constants.ts`

**After line 11** - Add constant:
```typescript
export const AI_SERVICE_ZAI = "zai";
```

#### `src/Models/Config.ts`

**ApiKeySettings interface** - Add:
```typescript
zaiApiKey: string;
```

**ServiceUrlSettings interface** - Add:
```typescript
zaiUrl: string;
```

**New interface** (after line ~168):
```typescript
export interface ZaiFrontmatterSettings {
  zaiDefaultModel: string;
  zaiDefaultTemperature: number;
  zaiDefaultMaxTokens: number;
}
```

**ChatGPT_MDSettings interface** - Extend with:
```typescript
ZaiFrontmatterSettings,
```

**DEFAULT_SETTINGS** - Add:
```typescript
// Z.AI
zaiApiKey: "",
zaiUrl: "https://api.z.ai/api/paas/v4",
zaiDefaultModel: "zai@glm-4.7",
zaiDefaultTemperature: 0.7,
zaiDefaultMaxTokens: 400,
```

#### `src/Services/DefaultConfigs.ts`

**After existing configs**:
```typescript
export const DEFAULT_ZAI_CONFIG = {
  aiService: "zai",
  max_tokens: 400,
  model: "zai@glm-4.7",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://api.z.ai/api/paas/v4",
};
```

#### `src/Services/AiProviderService.ts`

**Imports** (line ~31):
```typescript
import { ZaiAdapter } from "./Adapters/ZaiAdapter";
```

**Constructor adapters Map** (lines 64-75):
```typescript
["zai", new ZaiAdapter()],
```

**getProviderFactory()** (lines 358-378):
```typescript
case "zai":
  return createOpenAICompatible;
```

#### `src/Services/ApiAuthService.ts`

**getApiKey() method**:
```typescript
case "zai":
  return settings.zaiApiKey;
```

**createAuthHeaders() method**:
```typescript
case "zai":
  headers["Authorization"] = `Bearer ${apiKey}`;
  break;
```

#### `src/Views/ChatGPT_MDSettingsTab.ts`

**settingsSchema array** - Add API Key:
```typescript
{
  id: "zaiApiKey",
  name: "Z.AI API Key",
  description: "API Key for Z.AI (GLM models). Get your key at https://z.ai",
  type: "text",
  placeholder: "your Z.AI API Key",
  group: "API Keys",
},
```

**settingsSchema array** - Add Defaults:
```typescript
{
  id: "zaiUrl",
  name: "Z.AI API URL",
  description: "URL for Z.AI API",
  type: "text",
  placeholder: "https://api.z.ai/api/paas/v4",
  group: "Z.AI Defaults",
},
{
  id: "zaiDefaultModel",
  name: "Default Z.AI Model",
  description: "Default model for Z.AI chats (e.g., zai@glm-4.7)",
  type: "text",
  placeholder: "zai@glm-4.7",
  group: "Z.AI Defaults",
},
{
  id: "zaiDefaultTemperature",
  name: "Default Z.AI Temperature",
  description: "Default temperature for Z.AI chats (0.0 to 1.0)",
  type: "text",
  placeholder: "0.7",
  group: "Z.AI Defaults",
},
{
  id: "zaiDefaultMaxTokens",
  name: "Default Z.AI Max Tokens",
  description: "Default max tokens for Z.AI chats",
  type: "text",
  placeholder: "400",
  group: "Z.AI Defaults",
},
```

---

## 5. Configuration Schema

### 5.1 Settings Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| zaiApiKey | string | "" | Z.AI API key |
| zaiUrl | string | "https://api.z.ai/api/paas/v4" | Z.AI API base URL |
| zaiDefaultModel | string | "zai@glm-4.7" | Default model |
| zaiDefaultTemperature | number | 0.7 | Default temperature |
| zaiDefaultMaxTokens | number | 400 | Default max tokens |

### 5.2 Frontmatter Support

```yaml
---
model: zai@glm-4.7
temperature: 0.8
max_tokens: 1000
---
```

---

## 6. Error Handling

### 6.1 API Key Validation
- Empty API key: Return empty model list, show warning in logs
- Invalid API key: 401 error from API, show user-friendly message

### 6.2 Network Errors
- Connection timeout: Catch in fetchModels, log error, return empty list
- API unavailable: Same handling as timeout

### 6.3 Model Fetch Errors
- Invalid response format: Catch parse error, return empty list
- No GLM models in response: Return empty list (filtered out)

---

## 7. Security Considerations

1. **API Key Storage**: Stored in Obsidian settings (encrypted by Obsidian)
2. **HTTPS Only**: All API calls use HTTPS
3. **No Key Logging**: API keys never logged to console
4. **Header Security**: Keys only in Authorization header, not URL

---

## 8. Testing Requirements

### 8.1 Build Verification
```bash
npm run build  # Must succeed without errors
npm run lint   # Must pass without errors
```

### 8.2 Functional Tests
1. Settings UI displays Z.AI section
2. API key can be entered and saved
3. Model dropdown populates from API
4. Chat completion works with streaming
5. Frontmatter override works
6. Tool calling works (with enabled tools)

### 8.3 Edge Cases
1. Invalid API key returns empty model list
2. Network error handled gracefully
3. Empty API key handled (no crash)
