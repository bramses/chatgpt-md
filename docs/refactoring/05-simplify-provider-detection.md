# Task 5: Simplify Provider Detection

## Priority: MEDIUM
## Impact: ~40 lines removed
## Risk: Low

## Problem

The `aiProviderFromUrl()` function (lines 1034-1109 in AiService.ts) is 75 lines long with multiple detection strategies:

1. Model prefix checks (`openai@`, `anthropic@`, etc.)
2. Model name pattern matching (`claude`, `gemini`, `gpt`)
3. URL pattern matching (`openrouter`, `anthropic`, port `1234`)
4. Fallback logic

Most of this complexity is unnecessary because:
- Model prefixes are the canonical way to specify providers
- URL pattern matching is rarely needed (YAGNI)

## Solution

Simplify to focus on prefixes with minimal backward compatibility.

## Files to Modify

- `src/Services/AiService.ts`

## Implementation Steps

### Step 1: Replace aiProviderFromUrl function

**Location:** Lines 1034-1109

**Replace with:**

```typescript
/**
 * Determine the AI provider from a model string
 * Model prefixes (e.g., "openai@gpt-4") are the canonical way to specify providers
 */
export const aiProviderFromUrl = (url?: string, model?: string): string | undefined => {
  if (!model) {
    return undefined;
  }

  // Canonical: Check explicit provider prefixes
  const prefixMap: [string, string][] = [
    ['openai@', AI_SERVICE_OPENAI],
    ['anthropic@', AI_SERVICE_ANTHROPIC],
    ['gemini@', AI_SERVICE_GEMINI],
    ['ollama@', AI_SERVICE_OLLAMA],
    ['lmstudio@', AI_SERVICE_LMSTUDIO],
    ['openrouter@', AI_SERVICE_OPENROUTER],
    ['local@', AI_SERVICE_OLLAMA], // backward compatibility
  ];

  for (const [prefix, service] of prefixMap) {
    if (model.startsWith(prefix)) {
      return service;
    }
  }

  // Legacy: Infer from model name patterns (backward compatibility)
  const modelLower = model.toLowerCase();

  if (modelLower.includes('claude')) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (modelLower.includes('gemini')) {
    return AI_SERVICE_GEMINI;
  }
  if (modelLower.includes('gpt') || modelLower.startsWith('o1') || modelLower.startsWith('o3') || modelLower.startsWith('o4')) {
    return AI_SERVICE_OPENAI;
  }

  // Default to OpenAI for unrecognized models (most common case)
  return AI_SERVICE_OPENAI;
};
```

### Step 2: Remove aiProviderFromKeys if unused

Check if `aiProviderFromKeys` (lines 1114-1132) is used anywhere:

```bash
grep -r "aiProviderFromKeys" src/
```

If only used in one place or not at all, consider:
- Removing it entirely
- Or inlining it where used

## What Was Removed

1. URL pattern matching for `openrouter`, `anthropic`, `generativelanguage.googleapis.com`
2. Port-based detection (`:1234` for LM Studio)
3. `localhost`/`127.0.0.1` detection for Ollama
4. The `local` model name pattern (ambiguous)

## Why This Is Safe

1. **Prefixes are required for new configurations** - The UI shows prefixed models
2. **Legacy model names still work** - `claude-3`, `gpt-4`, `gemini-pro` still detected
3. **URL matching was unreliable** - Different users use different URLs
4. **Port matching was fragile** - Users may change default ports

## Testing

1. Test with prefixed models: `openai@gpt-4`, `anthropic@claude-3`
2. Test with legacy model names: `gpt-4`, `claude-3`, `gemini-pro`
3. Test that unknown models default to OpenAI
4. Verify existing frontmatter configurations still work

## Verification

```bash
npm run build
npm run lint
```
