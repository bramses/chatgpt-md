# Task 4: Simplify ServiceLocator Factory

## Priority: MEDIUM
## Impact: Easier extension
## Risk: Low

## Problem

The `ServiceLocator.getAiApiService()` method uses a switch statement with 6 cases:

```typescript
getAiApiService(serviceType: string): IAiApiService {
  switch (serviceType) {
    case AI_SERVICE_OPENAI:
      return new OpenAiService(...);
    case AI_SERVICE_ANTHROPIC:
      return new AnthropicService(...);
    // ... 4 more cases
    default:
      throw new Error(`Unknown AI service: ${serviceType}`);
  }
}
```

Adding a new provider requires adding a new case block.

## Solution

Use a registry Map for cleaner, more extensible code.

## Files to Modify

- `src/core/ServiceLocator.ts`

## Implementation Steps

### Step 1: Add registry Map (after imports)

Add after the imports section:

```typescript
import { OpenAiService } from "src/Services/OpenAiService";
import { AnthropicService } from "src/Services/AnthropicService";
import { GeminiService } from "src/Services/GeminiService";
import { OllamaService } from "src/Services/OllamaService";
import { LmStudioService } from "src/Services/LmStudioService";
import { OpenRouterService } from "src/Services/OpenRouterService";
import {
  AI_SERVICE_OPENAI,
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OPENROUTER,
} from "src/Constants";

/**
 * Registry mapping service types to their constructors
 */
const AI_SERVICE_REGISTRY: Map<string, new () => IAiApiService> = new Map([
  [AI_SERVICE_OPENAI, OpenAiService],
  [AI_SERVICE_ANTHROPIC, AnthropicService],
  [AI_SERVICE_GEMINI, GeminiService],
  [AI_SERVICE_OLLAMA, OllamaService],
  [AI_SERVICE_LMSTUDIO, LmStudioService],
  [AI_SERVICE_OPENROUTER, OpenRouterService],
]);
```

### Step 2: Replace getAiApiService method

**Before:**
```typescript
getAiApiService(serviceType: string): IAiApiService {
  switch (serviceType) {
    case AI_SERVICE_OPENAI:
      return new OpenAiService(
        this.errorService,
        this.notificationService,
        this.apiService,
        this.apiAuthService,
        this.apiResponseParser
      );
    case AI_SERVICE_ANTHROPIC:
      return new AnthropicService(
        this.errorService,
        this.notificationService,
        this.apiService,
        this.apiAuthService,
        this.apiResponseParser
      );
    // ... more cases
  }
}
```

**After:**
```typescript
getAiApiService(serviceType: string): IAiApiService {
  const ServiceClass = AI_SERVICE_REGISTRY.get(serviceType);

  if (!ServiceClass) {
    throw new Error(`Unknown AI service type: ${serviceType}`);
  }

  return new ServiceClass();
}
```

### Step 3: Remove unused dependencies from ServiceLocator

After Task 2 (simplify constructors) is complete, these fields in ServiceLocator are no longer needed for AI service creation:
- `errorService` - only if not used elsewhere
- `notificationService` - only if not used elsewhere
- `apiService` - only if not used elsewhere
- `apiAuthService` - only if not used elsewhere
- `apiResponseParser` - only if not used elsewhere

Check if they're used by other services before removing.

## Benefits

1. **Adding a new provider** requires only 1 line:
   ```typescript
   [AI_SERVICE_NEW_PROVIDER, NewProviderService],
   ```

2. **Cleaner code** - No switch statement boilerplate

3. **Type safety** - TypeScript ensures all services implement `IAiApiService`

## Testing

1. Test creating each service type
2. Test error handling for unknown service type
3. Verify all providers still work correctly

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

This task is easier to implement after Task 2 (simplify constructors) is complete, since the constructors won't require parameters.
