# RESEARCH_SUMMARY: Z.AI Integration

**Issue:** add-z-ai-integration
**Date:** 2026-02-04
**For:** Planning Phase

---

## Key Findings

### Integration Approach
Z.AI uses an **OpenAI-compatible API** and can be integrated using the existing `createOpenAICompatible` factory from Vercel AI SDK. This is the same pattern used for Ollama and LM Studio.

### Complexity: LOW
- 1 new file (adapter)
- 8 files to modify
- ~150-200 lines total
- No new dependencies

---

## Z.AI API Specification

| Property | Value |
|----------|-------|
| Base URL | `https://api.z.ai/api/paas/v4` |
| Auth | Bearer token (`Authorization: Bearer {API_KEY}`) |
| Chat Endpoint | `/v1/chat/completions` |
| Models Endpoint | `/v1/models` |
| Streaming | SSE (Server-Sent Events) |
| Compatible | OpenAI SDK with custom baseURL |

### Models
| Model | Free | Context |
|-------|------|---------|
| glm-4.7 | No | 200K |
| glm-4.7-flash | **Yes** | 200K |
| glm-4.6 | No | 200K |
| glm-4.5 | No | 128K |
| glm-4.5-flash | **Yes** | 200K |

---

## Integration Points (File:Line)

### 1. Type Definition
`src/Services/Adapters/ProviderAdapter.ts:6`
- Add `"zai"` to `ProviderType` union

### 2. Constants
`src/Constants.ts:12`
- Add `export const AI_SERVICE_ZAI = "zai";`

### 3. New Adapter (CREATE)
`src/Services/Adapters/ZaiAdapter.ts`
- Extend `BaseProviderAdapter`
- Use `createOpenAICompatible` factory
- Implement `fetchModels()` with `/v1/models`
- Return Bearer auth headers

### 4. Adapter Registration
`src/Services/AiProviderService.ts:64-75`
- Import ZaiAdapter
- Add to adapters Map
- Add case to `getProviderFactory()` returning `createOpenAICompatible`

### 5. API Key Management
`src/Services/ApiAuthService.ts:40-125`
- Add case in `getApiKey()` for "zai"
- Add case in `createAuthHeaders()` for "zai"

### 6. Settings Types
`src/Models/Config.ts:44-316`
- Add `zaiApiKey` to `ApiKeySettings`
- Add `zaiUrl` to `ServiceUrlSettings`
- Create `ZaiFrontmatterSettings` interface
- Extend `ChatGPT_MDSettings`
- Add defaults to `DEFAULT_SETTINGS`

### 7. Default Config
`src/Services/DefaultConfigs.ts:123+`
- Add `DEFAULT_ZAI_CONFIG` object

### 8. Settings UI
`src/Views/ChatGPT_MDSettingsTab.ts:43-340`
- Add API key field to settingsSchema
- Add Z.AI defaults group

---

## Reference Implementation: LmStudioAdapter

Best template because:
1. Uses same `createOpenAICompatible` factory
2. Fetches models from `/v1/models`
3. Simple, clean implementation

Key differences for Z.AI:
- Requires API key (LM Studio doesn't)
- Remote URL instead of localhost
- Filter to "glm" models

---

## Tool Support Status

✅ **Already whitelisted** in `ToolSupportDetector.ts:243-252`

Models in whitelist:
- z-ai/glm-4.7, z-ai/glm-4.7-flash
- z-ai/glm-4.6, z-ai/glm-4.6v
- z-ai/glm-4.5, z-ai/glm-4.5-air

No changes needed.

---

## Design Decisions for Planning

1. **Model Prefix**: `zai@model-name` (e.g., `zai@glm-4.7`)
2. **Default Model**: `zai@glm-4.7` (flagship model)
3. **Default Temperature**: 0.7 (matches other providers)
4. **Settings Group**: "Z.AI Defaults"
5. **Model Filtering**: Filter to "glm" models only

---

## Dependencies

Already installed - no changes needed:
```json
{
  "ai": "6.0.67",
  "@ai-sdk/openai-compatible": "^2.0.26"
}
```

---

## Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| API path concatenation | Low | Test `/api/paas/v4/v1/` path works |
| Model list format | Low | Verify response has `data[].id` |
| No automated tests | Medium | Manual testing checklist |

---

## Implementation Order

1. Constants and types (foundation)
2. Settings configuration (API key storage)
3. ZaiAdapter implementation (core logic)
4. AiProviderService registration (wiring)
5. ApiAuthService integration (auth flow)
6. Settings UI (user interface)
7. Manual testing
