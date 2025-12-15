# Task 2: Simplify Provider Service Constructors

## Priority: HIGH
## Impact: ~60 lines removed
## Risk: Low (structural change only)

## Problem

All 6 provider services have identical constructor patterns with redundant dependency declarations:

```typescript
// Current pattern in each service (OpenAiService, AnthropicService, etc.)
export class OpenAiService extends BaseAiService {
  protected errorService: ErrorService;           // REDUNDANT - already in base
  protected notificationService: NotificationService;  // REDUNDANT - already in base
  protected apiService: ApiService;               // REDUNDANT - already in base
  protected apiAuthService: ApiAuthService;       // REDUNDANT - already in base
  protected apiResponseParser: ApiResponseParser; // REDUNDANT - already in base

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    super(errorService, notificationService);
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService(this.notificationService);
    this.apiResponseParser = apiResponseParser || new ApiResponseParser(this.notificationService);
  }
}
```

## Solution

Move all dependency creation to `BaseAiService` and simplify provider constructors.

## Files to Modify

1. `src/Services/AiService.ts`
2. `src/Services/OpenAiService.ts`
3. `src/Services/AnthropicService.ts`
4. `src/Services/GeminiService.ts`
5. `src/Services/OllamaService.ts`
6. `src/Services/LmStudioService.ts`
7. `src/Services/OpenRouterService.ts`

## Implementation Steps

### Step 1: Update BaseAiService constructor (AiService.ts)

Replace lines 108-114:

**Before:**
```typescript
constructor(errorService?: ErrorService, notificationService?: NotificationService) {
  this.notificationService = notificationService ?? new NotificationService();
  this.errorService = errorService ?? new ErrorService(this.notificationService);
  this.apiService = new ApiService(this.errorService, this.notificationService);
  this.apiAuthService = new ApiAuthService(this.notificationService);
  this.apiResponseParser = new ApiResponseParser(this.notificationService);
}
```

**After:**
```typescript
constructor() {
  this.notificationService = new NotificationService();
  this.errorService = new ErrorService(this.notificationService);
  this.apiService = new ApiService(this.errorService, this.notificationService);
  this.apiAuthService = new ApiAuthService(this.notificationService);
  this.apiResponseParser = new ApiResponseParser(this.notificationService);
}
```

### Step 2: Simplify OpenAiService.ts

**Before (lines 72-93):**
```typescript
export class OpenAiService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_OPENAI;
  protected provider: OpenAIProvider;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    super(errorService, notificationService);
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService(this.notificationService);
    this.apiResponseParser = apiResponseParser || new ApiResponseParser(this.notificationService);
  }
```

**After:**
```typescript
export class OpenAiService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_OPENAI;
  protected provider: OpenAIProvider;

  constructor() {
    super();
  }
```

### Step 3: Apply same pattern to all other services

Apply the same simplification to:

- `AnthropicService.ts` - Remove lines 68-88, simplify constructor
- `GeminiService.ts` - Remove redundant declarations
- `OllamaService.ts` - Remove redundant declarations
- `LmStudioService.ts` - Remove redundant declarations
- `OpenRouterService.ts` - Remove redundant declarations

Each service should only have:
```typescript
export class [ServiceName] extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_[NAME];
  protected provider: [ProviderType];

  constructor() {
    super();
  }
  // ... rest of methods unchanged
}
```

### Step 4: Update ServiceLocator.ts

Since constructors no longer take parameters, update `getAiApiService`:

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
    // ... more cases
  }
}
```

**After:**
```typescript
getAiApiService(serviceType: string): IAiApiService {
  switch (serviceType) {
    case AI_SERVICE_OPENAI:
      return new OpenAiService();
    case AI_SERVICE_ANTHROPIC:
      return new AnthropicService();
    case AI_SERVICE_GEMINI:
      return new GeminiService();
    case AI_SERVICE_OLLAMA:
      return new OllamaService();
    case AI_SERVICE_LMSTUDIO:
      return new LmStudioService();
    case AI_SERVICE_OPENROUTER:
      return new OpenRouterService();
    default:
      throw new Error(`Unknown AI service: ${serviceType}`);
  }
}
```

## Testing

1. Test each provider works correctly
2. Verify error handling still functions
3. Verify notifications still appear
4. Test API key validation still works

## Verification

```bash
npm run build   # Should compile without errors
npm run lint    # Should pass linting
```

## Notes

- This change removes the ability to inject mock dependencies for testing
- If testing is needed, consider using a factory pattern or adding test-specific constructors later
- The current codebase doesn't appear to have unit tests, so this simplification is safe
