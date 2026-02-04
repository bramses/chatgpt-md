# IMPLEMENTATION_PLAN: Z.AI Integration

**Issue:** add-z-ai-integration
**Date:** 2026-02-04
**Estimated Complexity:** Low

---

## Overview

Add Z.AI as a new AI provider for the ChatGPT MD Obsidian plugin, enabling users to access GLM models (glm-4.7, glm-4.6, glm-4.5 series) through an OpenAI-compatible API.

---

## Phase 1: Foundation (Types & Constants)

### Task 1.1: Add ProviderType
**File:** `src/Services/Adapters/ProviderAdapter.ts`
**Change:** Add `"zai"` to ProviderType union at line 6

```typescript
// Before:
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot";

// After:
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot" | "zai";
```

### Task 1.2: Add Service Constant
**File:** `src/Constants.ts`
**Change:** Add AI_SERVICE_ZAI constant after line 11

```typescript
export const AI_SERVICE_ZAI = "zai";
```

### Task 1.3: Add Settings Types
**File:** `src/Models/Config.ts`
**Changes:**
1. Add `zaiApiKey: string;` to ApiKeySettings interface
2. Add `zaiUrl: string;` to ServiceUrlSettings interface
3. Create ZaiFrontmatterSettings interface
4. Extend ChatGPT_MDSettings to include ZaiFrontmatterSettings
5. Add defaults to DEFAULT_SETTINGS

---

## Phase 2: Core Implementation (Adapter)

### Task 2.1: Create ZaiAdapter
**File:** `src/Services/Adapters/ZaiAdapter.ts` (NEW)
**Create:** Complete adapter implementation

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

### Task 2.2: Add Default Configuration
**File:** `src/Services/DefaultConfigs.ts`
**Change:** Add DEFAULT_ZAI_CONFIG after existing configs

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

---

## Phase 3: Service Integration

### Task 3.1: Register Adapter in AiProviderService
**File:** `src/Services/AiProviderService.ts`
**Changes:**
1. Import ZaiAdapter at line ~31
2. Add to adapters Map at lines 64-75
3. Add case to getProviderFactory() at lines 358-378

```typescript
// Import
import { ZaiAdapter } from "./Adapters/ZaiAdapter";

// Registration in constructor
["zai", new ZaiAdapter()],

// Factory case
case "zai":
  return createOpenAICompatible;
```

### Task 3.2: Add API Key Management
**File:** `src/Services/ApiAuthService.ts`
**Changes:**
1. Add case in getApiKey() method
2. Add case in createAuthHeaders() method

```typescript
// In getApiKey()
case "zai":
  return settings.zaiApiKey;

// In createAuthHeaders()
case "zai":
  headers["Authorization"] = `Bearer ${apiKey}`;
  break;
```

---

## Phase 4: Settings UI

### Task 4.1: Add Settings Schema
**File:** `src/Views/ChatGPT_MDSettingsTab.ts`
**Changes:** Add settings to settingsSchema array

```typescript
// API Keys section
{
  id: "zaiApiKey",
  name: "Z.AI API Key",
  description: "API Key for Z.AI (GLM models). Get your key at https://z.ai",
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

## Implementation Order

| Phase | Task | File | Priority |
|-------|------|------|----------|
| 1 | 1.1 Add ProviderType | ProviderAdapter.ts | Critical |
| 1 | 1.2 Add Constant | Constants.ts | Critical |
| 1 | 1.3 Add Settings Types | Config.ts | Critical |
| 2 | 2.1 Create Adapter | ZaiAdapter.ts | Critical |
| 2 | 2.2 Add Default Config | DefaultConfigs.ts | High |
| 3 | 3.1 Register Adapter | AiProviderService.ts | Critical |
| 3 | 3.2 Add API Key Mgmt | ApiAuthService.ts | Critical |
| 4 | 4.1 Add Settings UI | ChatGPT_MDSettingsTab.ts | High |

---

## Testing Strategy

### Manual Testing Checklist
1. [ ] Build succeeds (`npm run build`)
2. [ ] Lint passes (`npm run lint`)
3. [ ] Settings UI shows Z.AI section
4. [ ] API key can be saved
5. [ ] Model list fetches successfully
6. [ ] Chat works with `zai@glm-4.7`
7. [ ] Streaming responses work
8. [ ] Frontmatter override works: `model: zai@glm-4.7`
9. [ ] Tool calling works (if user has tools enabled)

### Error Scenarios
1. [ ] Invalid API key shows appropriate error
2. [ ] Network error handled gracefully
3. [ ] Invalid model name handled

---

## Acceptance Criteria

1. Z.AI appears as a provider option in settings
2. Users can enter Z.AI API key
3. Model list auto-populates from Z.AI API
4. Chat completions work with streaming
5. Frontmatter model override works
6. Tool calling works with whitelisted models
7. No TypeScript errors
8. Lint passes
9. Build succeeds

---

## Rollback Plan

If issues arise:
1. Remove ZaiAdapter.ts
2. Revert changes to all modified files
3. Changes are isolated - no impact on existing providers
