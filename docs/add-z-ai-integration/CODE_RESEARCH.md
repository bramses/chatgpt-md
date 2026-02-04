# CODE_RESEARCH: Z.AI Integration

**Issue:** add-z-ai-integration
**Date:** 2026-02-04
**Risk Level:** Low

---

## 1. Executive Summary

**Key Finding**: Z.AI can be integrated as an **OpenAI-compatible provider** using the existing `createOpenAICompatible` factory from the Vercel AI SDK. The codebase already includes Z.AI models in the tool-calling whitelist.

**Integration Complexity**: **LOW** - Z.AI requires minimal code changes due to:
- OpenAI-compatible API format
- Bearer token authentication (standard)
- Server-Sent Events (SSE) streaming support
- Existing OpenAI-compatible adapter pattern (used by Ollama, LM Studio)

**Files to Create**: 1 new adapter file
**Files to Modify**: 8 existing files
**Lines of Code**: ~150-200 total changes

---

## 2. Architecture Overview

The codebase uses a **provider adapter pattern** with these layers:

### Provider Registry (`AiProviderService.ts:64-75`)
```
AiProviderService
  ├── Adapter Map<ProviderType, ProviderAdapter>
  │   ├── "openai" → OpenAIAdapter
  │   ├── "anthropic" → AnthropicAdapter
  │   ├── "ollama" → OllamaAdapter
  │   ├── "openrouter" → OpenRouterAdapter
  │   ├── "gemini" → GeminiAdapter
  │   ├── "lmstudio" → LmStudioAdapter
  │   └── "copilot" → CopilotAdapter
  └── currentAdapter (active provider)
```

### ProviderAdapter Interface (`src/Services/Adapters/ProviderAdapter.ts:44-110`)
Each adapter must implement:
```typescript
interface ProviderAdapter {
  readonly type: ProviderType;
  readonly displayName: string;
  getDefaultBaseUrl(): string;
  getAuthHeaders(apiKey: string): Record<string, string>;
  fetchModels(...): Promise<string[]>;
  getSystemMessageRole(): "system" | "developer";
  supportsSystemField(): boolean;
  supportsToolCalling(): boolean;
  requiresApiKey(): boolean;
  extractModelName(modelId: string): string;
}
```

### AI SDK Factory Selection (`AiProviderService.ts:358-378`)
```typescript
getProviderFactory(type: ProviderType): any {
  switch (type) {
    case "openai": return createOpenAI;
    case "openrouter": return createOpenRouter;
    case "ollama":
    case "lmstudio":
      return createOpenAICompatible;  // ← Z.AI GOES HERE
    case "gemini": return createGoogleGenerativeAI;
    case "anthropic": return createAnthropic;
    case "copilot": return null;
  }
}
```

---

## 3. Existing Provider Analysis

### LmStudioAdapter (Best Reference)
**Location**: `src/Services/Adapters/LmStudioAdapter.ts`

The **LmStudioAdapter** is the best reference model since:
1. Uses `createOpenAICompatible` (exact requirement for Z.AI)
2. Standard model fetching via `/v1/models`
3. Simple implementation (~50 lines)

Key differences from Z.AI:
- LM Studio doesn't require API key (Z.AI does)
- LM Studio uses localhost (Z.AI uses remote URL)

### OpenAIAdapter (Auth Reference)
**Location**: `src/Services/Adapters/OpenAIAdapter.ts:27-32`

Shows standard Bearer auth pattern:
```typescript
getAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}
```

### Comparison Table

| Feature | Z.AI | OpenRouter | LM Studio | Ollama |
|---------|------|-----------|-----------|--------|
| API Type | OpenAI Compatible | OpenAI Compatible | OpenAI Compatible | OpenAI Compatible |
| Requires API Key | Yes | Yes | No | No |
| Auth Header | Bearer | Bearer | None | None |
| Base URL | `api.z.ai/api/paas/v4` | openrouter.ai | localhost:1234 | localhost:11434 |
| Models Endpoint | /v1/models | /api/v1/models | /v1/models | /api/tags |
| Streaming | Yes (SSE) | Yes (SSE) | Yes (SSE) | Yes (SSE) |
| Tool Support | Yes (whitelisted) | Yes | Limited | Limited |

---

## 4. Integration Points

### 4.1 ProviderType Union
**File**: `src/Services/Adapters/ProviderAdapter.ts:6`
```typescript
// Current:
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot";

// Add "zai":
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot" | "zai";
```

### 4.2 Constants
**File**: `src/Constants.ts:5-12`
```typescript
// Add after existing constants:
export const AI_SERVICE_ZAI = "zai";
```

### 4.3 New Adapter File
**Create**: `src/Services/Adapters/ZaiAdapter.ts`

Template based on LmStudioAdapter + OpenAI auth:
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
      const models = await makeGetRequest(`${url}/v1/models`, headers, this.type);

      return models.data
        .filter((model: ZaiModel) => model.id.includes("glm"))
        .sort((a: ZaiModel, b: ZaiModel) => a.id.localeCompare(b.id))
        .map((model: ZaiModel) => this.prefixModelId(model.id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }
}
```

### 4.4 Adapter Registration
**File**: `src/Services/AiProviderService.ts`

**Import** (line ~31):
```typescript
import { ZaiAdapter } from "./Adapters/ZaiAdapter";
```

**Registration** (lines 64-75):
```typescript
this.adapters = new Map<ProviderType, ProviderAdapter>([
  // ... existing adapters
  ["zai", new ZaiAdapter()],
]);
```

**Factory** (lines 358-378):
```typescript
case "zai":
  return createOpenAICompatible;
```

### 4.5 API Key Management
**File**: `src/Services/ApiAuthService.ts`

In `getApiKey()` method (around line 49):
```typescript
case "zai":
  return settings.zaiApiKey;
```

In `createAuthHeaders()` method (around line 112):
```typescript
case "zai":
  headers["Authorization"] = `Bearer ${apiKey}`;
  break;
```

### 4.6 Settings Configuration
**File**: `src/Models/Config.ts`

**ApiKeySettings interface** (after line 52):
```typescript
zaiApiKey: string;
```

**ServiceUrlSettings interface** (after line 193):
```typescript
zaiUrl: string;
```

**ZaiFrontmatterSettings interface** (new, after line 168):
```typescript
export interface ZaiFrontmatterSettings {
  zaiDefaultModel: string;
  zaiDefaultTemperature: number;
  zaiDefaultMaxTokens: number;
}
```

**ChatGPT_MDSettings interface** (line 213-228):
```typescript
export interface ChatGPT_MDSettings extends
  // ... existing interfaces
  ZaiFrontmatterSettings,
  // ...
{}
```

**DEFAULT_SETTINGS** (around line 233-238):
```typescript
zaiApiKey: "",
zaiUrl: "https://api.z.ai/api/paas/v4",
zaiDefaultModel: "zai@glm-4.7",
zaiDefaultTemperature: 0.7,
zaiDefaultMaxTokens: 400,
```

### 4.7 Default Configuration
**File**: `src/Services/DefaultConfigs.ts` (after line 123)
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

### 4.8 Settings UI
**File**: `src/Views/ChatGPT_MDSettingsTab.ts`

Add to `settingsSchema` array:
```typescript
// API Keys section
{
  id: "zaiApiKey",
  name: "Z.AI API Key",
  description: "API Key for Z.AI (GLM models)",
  type: "text",
  placeholder: "your Z.AI API Key",
  group: "API Keys",
},
// Z.AI Defaults section
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
  description: "Default model for Z.AI chats",
  type: "text",
  placeholder: "zai@glm-4.7",
  group: "Z.AI Defaults",
},
{
  id: "zaiDefaultTemperature",
  name: "Default Z.AI Temperature",
  description: "Default temperature for Z.AI chats (0.0 to 2.0)",
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

## 5. Configuration Requirements

### Z.AI API Specification

| Property | Value |
|----------|-------|
| **Base URL** | `https://api.z.ai/api/paas/v4/` |
| **Auth Method** | Bearer token (HTTP header) |
| **Auth Header** | `Authorization: Bearer {API_KEY}` |
| **Endpoint** | `/v1/chat/completions` (OpenAI-compatible) |
| **Models Endpoint** | `/v1/models` |
| **Streaming** | Yes, SSE-based |

### Available Models

| Model | Type | Context | Pricing (per 1M tokens) |
|-------|------|---------|-------------------------|
| glm-4.7 | Flagship | 200K | $0.6 / $2.2 |
| glm-4.7-flash | Free | 200K | Free |
| glm-4.7-flashx | Fast | 200K | $0.07 / $0.4 |
| glm-4.6 | High Perf | 200K | $0.6 / $2.2 |
| glm-4.5 | Strong Reasoning | 128K | $0.6 / $2.2 |
| glm-4.5-flash | Free | 200K | Free |
| glm-4.5-x | Fast | 128K | $2.2 / $8.9 |
| glm-4-32b-0414-128k | Cost-effective | 128K | $0.1 / $0.1 |

### Tool Support
**Status**: ✅ Already whitelisted in `src/Services/ToolSupportDetector.ts:243-252`

Models already in whitelist:
- z-ai/glm-4-32b
- z-ai/glm-4.5, z-ai/glm-4.5-air
- z-ai/glm-4.6, z-ai/glm-4.6v
- z-ai/glm-4.7, z-ai/glm-4.7-flash

---

## 6. Risk Assessment

### Low Risk ✅
- Simple adapter implementation (~50-80 lines)
- No dependency changes needed (`@ai-sdk/openai-compatible` already installed)
- Models already whitelisted for tool calling
- Follows established patterns (LmStudioAdapter, OpenAIAdapter)
- No custom SDK required (uses Vercel AI SDK)

### Medium Risk ⚠️
- API endpoint path (`/api/paas/v4/v1/` vs `/v1/`) needs testing
- Model listing response format needs validation
- No existing integration tests (codebase has no test suite)

### Testing Checklist
- [ ] API key from Z.AI obtained and tested manually
- [ ] Verify `/v1/models` endpoint returns expected format
- [ ] Test `glm-4.7` model specifically
- [ ] Verify streaming works
- [ ] Test tool calling with whitelisted model
- [ ] Test model listing in settings UI
- [ ] Test frontmatter override: `model: zai@glm-4.7`

---

## 7. Questions for Planning

1. **Model Prefix Convention**
   - Recommended: `zai@model-name` (consistent with other providers)
   - Decision: Use `zai@` prefix

2. **Default Model Selection**
   - Options: `glm-4.7` (flagship) vs `glm-4.5-flash` (free)
   - Recommended: `glm-4.7` (best performance, users expect quality)

3. **Settings Group Name**
   - Options: "Z.AI Defaults", "Z.AI (GLM)", "Z.AI Configuration"
   - Recommended: "Z.AI Defaults" (matches other provider sections)

4. **Model Filtering**
   - Options: Filter to "glm" models only vs accept all
   - Recommended: Filter to "glm" (cleaner model list)

---

## 8. Dependencies Status

### Already Installed ✅
```json
{
  "ai": "6.0.67",
  "@ai-sdk/openai": "^3.0.25",
  "@ai-sdk/openai-compatible": "^2.0.26"
}
```

No new dependencies required.

---

## 9. Files Summary

### New Files (1)
| File | Lines | Purpose |
|------|-------|---------|
| `src/Services/Adapters/ZaiAdapter.ts` | ~80 | Z.AI provider adapter |

### Modified Files (8)
| File | Changes | Purpose |
|------|---------|---------|
| `src/Services/Adapters/ProviderAdapter.ts` | 1 line | Add "zai" to ProviderType |
| `src/Services/AiProviderService.ts` | 3 locations | Import, registration, factory |
| `src/Services/ApiAuthService.ts` | 2 methods | API key retrieval, auth headers |
| `src/Services/DefaultConfigs.ts` | ~15 lines | Z.AI default config |
| `src/Constants.ts` | 1 line | AI_SERVICE_ZAI constant |
| `src/Models/Config.ts` | ~20 lines | Settings interfaces and defaults |
| `src/Views/ChatGPT_MDSettingsTab.ts` | ~30 lines | Settings UI schema |

### Unchanged
| File | Reason |
|------|--------|
| `src/Services/ToolSupportDetector.ts` | Z.AI models already whitelisted |
| `package.json` | All dependencies present |
