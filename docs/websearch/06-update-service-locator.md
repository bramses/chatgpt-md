# Task 6: Update ServiceLocator

## Priority: HIGH
## File: src/core/ServiceLocator.ts

## Goal

Initialize and provide access to WebSearchService through the ServiceLocator.

## Implementation

### Step 1: Add import

```typescript
import { WebSearchService } from "src/Services/WebSearchService";
```

### Step 2: Add private property

In the class properties section (around line 70):

```typescript
private webSearchService: WebSearchService;
```

### Step 3: Initialize WebSearchService

In `initializeServices()`, add after NotificationService initialization (before tool services):

```typescript
// Initialize web search service
this.webSearchService = new WebSearchService(this.notificationService);
```

### Step 4: Update ToolRegistry initialization

Modify the ToolRegistry constructor call to include WebSearchService:

```typescript
// Initialize tool services
this.vaultTools = new VaultTools(this.app, this.fileService);
this.toolRegistry = new ToolRegistry(this.app, this.vaultTools, this.webSearchService);  // Updated
this.toolExecutor = new ToolExecutor(this.app, this.toolRegistry, this.notificationService);
this.toolService = new ToolService(this.app, this.toolRegistry, this.toolExecutor);
```

### Step 5: Add getter method

Add at the end of the class with other getters:

```typescript
/**
 * Get the web search service
 */
getWebSearchService(): WebSearchService {
  return this.webSearchService;
}
```

## Complete Change Summary

```typescript
// At top of file
import { WebSearchService } from "src/Services/WebSearchService";

// In class properties
private webSearchService: WebSearchService;

// In initializeServices()
this.webSearchService = new WebSearchService(this.notificationService);

// Update ToolRegistry line
this.toolRegistry = new ToolRegistry(this.app, this.vaultTools, this.webSearchService);

// Add getter
getWebSearchService(): WebSearchService {
  return this.webSearchService;
}
```

## Location in File

- Import: Top of file
- Property: Around line 70
- Initialization: In `initializeServices()` around line 115
- ToolRegistry update: Line 117
- Getter: End of class

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

- Task 3 (WebSearchService) must be completed
- Task 5 (ToolRegistry update) should be done first or together

## Notes

- WebSearchService only needs NotificationService for error messages
- The service is passed to ToolRegistry for tool registration
- Order matters: WebSearchService must be created before ToolRegistry

## Next Task

[07-process-results](./07-process-results.md)
