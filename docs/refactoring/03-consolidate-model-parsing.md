# Task 3: Consolidate Model Name Parsing

## Priority: MEDIUM
## Impact: Code clarity
## Risk: Low

## Problem

Model prefix parsing is duplicated in every provider service:

```typescript
// OpenAiService.ts line 133
const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

// AnthropicService.ts line 131
const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

// GeminiService.ts, OllamaService.ts, LmStudioService.ts, OpenRouterService.ts
// All have the same line
```

## Solution

Add a single utility method in `BaseAiService`.

## Files to Modify

1. `src/Services/AiService.ts`
2. All provider services (to use the new method)

## Implementation Steps

### Step 1: Add utility method to BaseAiService (AiService.ts)

Add after line 340 (after `getApiEndpoint`):

```typescript
/**
 * Extract model name by removing provider prefix
 * e.g., "openai@gpt-4" -> "gpt-4"
 */
protected extractModelName(model: string): string {
  const atIndex = model.indexOf('@');
  return atIndex !== -1 ? model.slice(atIndex + 1) : model;
}
```

### Step 2: Update OpenAiService.ts

**Lines 133 and 171 - Replace:**
```typescript
const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;
```

**With:**
```typescript
const modelName = this.extractModelName(config.model);
```

### Step 3: Update AnthropicService.ts

**Lines 131 and 171 - Same replacement**

### Step 4: Update GeminiService.ts

**Find and replace all instances**

### Step 5: Update OllamaService.ts

**Find and replace all instances**

### Step 6: Update LmStudioService.ts

**Find and replace all instances**

### Step 7: Update OpenRouterService.ts

**Find and replace all instances**

## Search Pattern

Use this regex to find all instances:
```
config\.model\.includes\("@"\) \? config\.model\.split\("@"\)\[1\] : config\.model
```

Replace with:
```
this.extractModelName(config.model)
```

## Testing

1. Test models with prefix: `openai@gpt-4`
2. Test models without prefix: `gpt-4`
3. Test all providers still resolve models correctly

## Verification

```bash
npm run build
npm run lint
```
