# Task 7: Cleanup Configuration Interfaces (Optional)

## Priority: LOW
## Impact: Cleaner types
## Risk: Medium (widespread changes)

## Problem

There are 6 provider-specific config interfaces that are nearly identical:

```typescript
// OpenAIConfig
interface OpenAIConfig {
  apiKey: string;
  aiService: string;
  frequency_penalty: number;  // OpenAI-specific
  max_tokens: number;
  model: string;
  presence_penalty: number;   // OpenAI-specific
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;              // OpenAI-specific
  url: string;
}

// AnthropicConfig - nearly identical, without frequency_penalty, presence_penalty, top_p
// GeminiConfig - nearly identical
// etc.
```

## Current Situation

Each service defines its own config interface:
- `OpenAIConfig` in `OpenAiService.ts`
- `AnthropicConfig` in `AnthropicService.ts`
- `GeminiConfig` in `GeminiService.ts`
- `OllamaConfig` in `OllamaService.ts`
- `LmStudioConfig` in `LmStudioService.ts`
- `OpenRouterConfig` in `OpenRouterService.ts`

## Option A: Unified Config (Recommended)

Create a single interface with optional provider-specific fields:

```typescript
// In src/Models/Config.ts
export interface AiServiceConfig {
  // Required for all providers
  model: string;
  stream: boolean;
  temperature: number;
  max_tokens: number;
  url: string;

  // Common optional
  apiKey?: string;
  aiService?: string;
  system_commands?: string[] | null;
  tags?: string[] | null;
  title?: string;

  // Provider-specific (OpenAI)
  frequency_penalty?: number;
  presence_penalty?: number;
  top_p?: number;

  // Allow additional properties for future providers
  [key: string]: unknown;
}
```

## Option B: Base + Extension (More Type-Safe)

```typescript
// Base config all providers share
interface BaseAiConfig {
  model: string;
  stream: boolean;
  temperature: number;
  max_tokens: number;
  url: string;
  system_commands?: string[] | null;
  tags?: string[] | null;
  title?: string;
}

// OpenAI extends base
interface OpenAIConfig extends BaseAiConfig {
  apiKey: string;
  aiService: 'openai';
  frequency_penalty: number;
  presence_penalty: number;
  top_p: number;
}

// Anthropic extends base
interface AnthropicConfig extends BaseAiConfig {
  apiKey: string;
  aiService: 'anthropic';
}
```

## Option C: Keep As-Is (Simplest)

The current approach isn't broken. If the interfaces work and don't cause confusion, keeping them separate is valid.

**Reasons to keep as-is:**
- Each service is self-contained
- TypeScript catches mismatches
- Refactoring has low ROI here

## Implementation (if choosing Option A)

### Step 1: Create unified interface in Config.ts

Add to `src/Models/Config.ts`:

```typescript
export interface AiServiceConfig {
  model: string;
  stream: boolean;
  temperature: number;
  max_tokens: number;
  url: string;
  apiKey?: string;
  aiService?: string;
  system_commands?: string[] | null;
  tags?: string[] | null;
  title?: string;
  frequency_penalty?: number;
  presence_penalty?: number;
  top_p?: number;
}
```

### Step 2: Update each service

In each service file, replace:
```typescript
config: OpenAIConfig
```
With:
```typescript
config: AiServiceConfig
```

### Step 3: Update DEFAULT_*_CONFIG exports

Keep the defaults as-is but type them as `AiServiceConfig`:
```typescript
export const DEFAULT_OPENAI_CONFIG: AiServiceConfig = {
  // ...
};
```

### Step 4: Remove old interfaces

Delete the individual interfaces from each service file.

## Testing

1. Verify TypeScript compiles without errors
2. Test each provider with various config options
3. Verify frontmatter parsing still works

## Verification

```bash
npm run build
npm run lint
```

## Recommendation

**Skip this task** unless the separate interfaces are causing actual problems. The current approach:
- Works correctly
- Is type-safe
- Follows the principle of "if it ain't broke, don't fix it"

Focus effort on Tasks 1-4 which have higher impact.
