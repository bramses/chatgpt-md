# Core Infrastructure

This directory contains the core architectural components: the dependency injection container and plugin initialization.

## ServiceContainer.ts

**Simple dependency injection container with readonly service instances.**

**Design philosophy**: NOT a service locator pattern - services are accessed directly as readonly properties, not through string-based lookups. Uses constructor injection with explicit dependency wiring.

### Factory Method

`ServiceContainer.create(app, plugin)` - The ONLY place where service dependencies are defined. When adding a new service, you MUST wire it here.

**Service instantiation order** (leaf nodes first, no circular dependencies):

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

5. **Agent service** (v3.1):
   - AgentService → App, FileService, FrontmatterManager
   - Late-bound to SettingsService via `setAgentService()` (same pattern as TemplateService)

6. **AI service factory**:
   - `aiProviderService: () => AiProviderService` - Factory function creating new instances per request

7. **Tool services** (v3.0):
   - VaultSearchService → App, FileService
   - WebSearchService → NotificationService
   - ToolService → App, FileService, NotificationService, Settings, VaultSearchService, WebSearchService

### Service Access

All services exposed as readonly properties:

```typescript
container.editorService; // Direct access
container.aiProviderService(); // Factory - creates new instance per request
container.toolService; // Direct access
container.agentService; // Direct access
```

### Adding a New Service

1. Create the service class with constructor dependencies
2. Add to `ServiceContainer.create()` in correct dependency order
3. Expose as readonly property
4. Update commands/handlers to use via container

### Key Architectural Changes

- **ServiceLocator.ts** → **ServiceContainer.ts**: No longer uses string-based lookups
- **CommandRegistry.ts** → Moved to `src/Commands/` directory
- **Individual AI services** → Consolidated into `AiProviderService` with adapter pattern

## main.ts

**Plugin entry point**

- `onload()` - Registers commands (including agent commands), initializes ServiceContainer
- `onunload()` - Cleanup, abort streaming
- `loadSettings()` - Load settings with migration

Agent commands registered:
- `ChooseAgentHandler` - Choose agent from folder (CallbackCommand)
- `CreateAgentHandler` - Create new agent with manual form or AI wizard (CallbackCommand, receives `ModelSelectHandler` for model list)
