# Core Infrastructure

This directory contains the core architectural component of the plugin.

## ServiceContainer.ts

**Simple dependency injection container with readonly service instances.**

**Design philosophy**: NOT a service locator pattern - services are accessed directly as readonly properties, not through string-based lookups. Uses constructor injection with explicit dependency wiring.

### Factory Method

`ServiceContainer.create(app, plugin)` - The ONLY place where service dependencies are defined.

**Service instantiation order** (leaf nodes first):

1. **Leaf services** (no dependencies):
   - NotificationService
   - ErrorService → NotificationService
   - ApiService → ErrorService, NotificationService
   - ApiAuthService → NotificationService

2. **Content services**:
   - FileService → App
   - FrontmatterManager → App
   - MessageService → FileService, NotificationService

3. **Settings service**:
   - SettingsService → Plugin, FrontmatterManager, NotificationService, ErrorService

4. **Editor service** (composite):
   - EditorService → App, FileService, MessageService, TemplateService, SettingsService
   - TemplateService → App, FileService, EditorService

5. **AI service factory**:
   - `aiProviderService: () => AiProviderService` - Factory function creating new instances per request

6. **Tool services**:
   - VaultSearchService → App, FileService
   - WebSearchService → NotificationService
   - ToolService → App, FileService, NotificationService, Settings, VaultSearchService, WebSearchService

### Service Access

All services exposed as readonly properties:

```typescript
container.editorService; // Direct access
container.aiProviderService(); // Factory - creates new instance
container.toolService; // Direct access
```

### Key Differences from Old Architecture

- **ServiceLocator.ts** → **ServiceContainer.ts**: No longer uses string-based lookups
- **CommandRegistry.ts** → Moved to `src/Commands/` directory
- **Individual AI services** → Consolidated into `AiProviderService` with adapter pattern
