# PLAN_SUMMARY: Z.AI Integration

**Issue:** add-z-ai-integration
**Date:** 2026-02-04
**For:** Implementation Phase

---

## Implementation Overview

Add Z.AI as a new AI provider using the existing OpenAI-compatible adapter pattern.

**Total Changes:** 1 new file, 8 modified files, ~200 lines

---

## Phase-by-Phase Breakdown

### Phase 1: Foundation (Types & Constants)

| Task | File | Change |
|------|------|--------|
| 1.1 | `src/Services/Adapters/ProviderAdapter.ts:6` | Add `"zai"` to ProviderType union |
| 1.2 | `src/Constants.ts:12` | Add `AI_SERVICE_ZAI = "zai"` |
| 1.3 | `src/Models/Config.ts` | Add settings interfaces and defaults |

**Config.ts Details:**
- Add `zaiApiKey: string` to ApiKeySettings
- Add `zaiUrl: string` to ServiceUrlSettings
- Create `ZaiFrontmatterSettings` interface
- Extend `ChatGPT_MDSettings`
- Add defaults to `DEFAULT_SETTINGS`

### Phase 2: Core Implementation (Adapter)

| Task | File | Change |
|------|------|--------|
| 2.1 | `src/Services/Adapters/ZaiAdapter.ts` | CREATE new adapter |
| 2.2 | `src/Services/DefaultConfigs.ts` | Add DEFAULT_ZAI_CONFIG |

**ZaiAdapter Key Methods:**
- `getDefaultBaseUrl()` → `"https://api.z.ai/api/paas/v4"`
- `getAuthHeaders()` → Bearer token
- `fetchModels()` → GET `/v1/models`, filter to "glm" models
- `requiresApiKey()` → `true`
- `supportsToolCalling()` → `true`

### Phase 3: Service Integration

| Task | File | Change |
|------|------|--------|
| 3.1 | `src/Services/AiProviderService.ts` | Import, register, factory |
| 3.2 | `src/Services/ApiAuthService.ts` | Add getApiKey and createAuthHeaders cases |

**AiProviderService Changes:**
1. Import: `import { ZaiAdapter } from "./Adapters/ZaiAdapter"`
2. Register: `["zai", new ZaiAdapter()]`
3. Factory: `case "zai": return createOpenAICompatible`

**ApiAuthService Changes:**
1. `getApiKey()`: `case "zai": return settings.zaiApiKey`
2. `createAuthHeaders()`: `case "zai": headers["Authorization"] = \`Bearer ${apiKey}\``

### Phase 4: Settings UI

| Task | File | Change |
|------|------|--------|
| 4.1 | `src/Views/ChatGPT_MDSettingsTab.ts` | Add settings schema |

**Settings to Add:**
- `zaiApiKey` (API Keys group)
- `zaiUrl` (Z.AI Defaults group)
- `zaiDefaultModel` (Z.AI Defaults group)
- `zaiDefaultTemperature` (Z.AI Defaults group)
- `zaiDefaultMaxTokens` (Z.AI Defaults group)

---

## File-by-File Implementation Guide

### 1. `src/Services/Adapters/ProviderAdapter.ts`
```typescript
// Line 6: Add "zai" to end of union
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot" | "zai";
```

### 2. `src/Constants.ts`
```typescript
// After line 11:
export const AI_SERVICE_ZAI = "zai";
```

### 3. `src/Models/Config.ts`
```typescript
// ApiKeySettings interface - add:
zaiApiKey: string;

// ServiceUrlSettings interface - add:
zaiUrl: string;

// New interface (after ~line 168):
export interface ZaiFrontmatterSettings {
  zaiDefaultModel: string;
  zaiDefaultTemperature: number;
  zaiDefaultMaxTokens: number;
}

// ChatGPT_MDSettings - extend with:
ZaiFrontmatterSettings,

// DEFAULT_SETTINGS - add:
zaiApiKey: "",
zaiUrl: "https://api.z.ai/api/paas/v4",
zaiDefaultModel: "zai@glm-4.7",
zaiDefaultTemperature: 0.7,
zaiDefaultMaxTokens: 400,
```

### 4. `src/Services/Adapters/ZaiAdapter.ts` (NEW FILE)
Create complete adapter - see PROJECT_SPEC.md for full implementation.

### 5. `src/Services/DefaultConfigs.ts`
```typescript
// After existing configs:
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

### 6. `src/Services/AiProviderService.ts`
```typescript
// Import at ~line 31:
import { ZaiAdapter } from "./Adapters/ZaiAdapter";

// In constructor adapters Map:
["zai", new ZaiAdapter()],

// In getProviderFactory():
case "zai":
  return createOpenAICompatible;
```

### 7. `src/Services/ApiAuthService.ts`
```typescript
// In getApiKey():
case "zai":
  return settings.zaiApiKey;

// In createAuthHeaders():
case "zai":
  headers["Authorization"] = `Bearer ${apiKey}`;
  break;
```

### 8. `src/Views/ChatGPT_MDSettingsTab.ts`
Add 5 settings entries - see IMPLEMENTATION_PLAN.md for full schema.

---

## Verification Steps

After each phase:
1. `npm run build` - Must pass
2. `npm run lint` - Must pass

After all phases:
1. Open Obsidian with dev plugin
2. Check Settings → ChatGPT MD → API Keys shows Z.AI
3. Enter API key, check model list populates
4. Test chat with `model: zai@glm-4.7` in frontmatter

---

## Key Technical Details

### Model Prefix
Use `zai@model-name` format (e.g., `zai@glm-4.7`)

### API Endpoint
Base: `https://api.z.ai/api/paas/v4`
Models: `GET /v1/models`
Chat: `POST /v1/chat/completions`

### Auth
Bearer token: `Authorization: Bearer {API_KEY}`

### Defaults
- Model: `zai@glm-4.7`
- Temperature: 0.7
- Max Tokens: 400
