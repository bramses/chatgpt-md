# Code Research: AI Agent Wizard

## Current Agent Architecture

### Agent Data Flow
```
CreateAgentModal → AgentService.createAgentFile() → Markdown file in agentFolder
```

### Key Files
| File | Purpose |
|------|---------|
| `src/Views/CreateAgentModal.ts` | Current manual agent creation form (166 lines) |
| `src/Commands/AgentHandlers.ts` | Command handlers for choose/create agent (71 lines) |
| `src/Services/AgentService.ts` | Agent CRUD and resolution (96 lines) |
| `src/core/ServiceContainer.ts` | DI container with all service wiring |
| `src/Commands/ModelSelectHandler.ts` | Model fetching and caching logic |
| `src/Models/Config.ts` | Settings interfaces |
| `src/Constants.ts` | Command IDs and constants |

### CreateAgentModal (Current Implementation)
- **Constructor**: `(app, agentService, settings, availableModels)`
- **Fields**: name, model (with autocomplete), temperature (slider 0-2), message (textarea)
- **Methods**: `addNameField`, `addModelField`, `addTemperatureField`, `addMessageField`, `addButtons`
- **Submit**: Validates name + model, calls `agentService.createAgentFile()`
- **UI**: Uses Obsidian's `Modal` base class with `Setting` components

### AgentService.createAgentFile()
```typescript
async createAgentFile(name, model, temperature, message, settings): Promise<TFile>
```
- Ensures agent folder exists
- Sanitizes filename
- Handles collision (appends (1), (2), etc.)
- Builds YAML frontmatter with model, temperature, stream: true
- Creates file with frontmatter + body (the agent message/prompt)

### CreateAgentHandler (Command)
```typescript
async execute(): Promise<void>
```
- Validates agent folder setting
- Ensures folder exists
- Gets `availableModels` from `ModelSelectHandler.getAvailableModels()`
- Opens `CreateAgentModal(app, agentService, settings, availableModels)`

### AI Call Pattern (for wizard)
The plugin uses `AiProviderService` with `generateText` (non-streaming) and `streamText` (streaming). For the wizard, we need **non-streaming** `generateText` to get a structured JSON response.

Key observation: `AiProviderService` is created via factory function `() => new AiProviderService()`. Each call creates a fresh instance. The provider is set from the model string prefix.

To make an AI call, we need:
1. An `AiProviderService` instance (from `services.aiProviderService()`)
2. API key (from `services.apiAuthService.getApiKey(settings, providerType)`)
3. URL (from settings based on provider)
4. Model string
5. Messages array

### Model Selection Pattern
`ModelSelectHandler.getAvailableModels()` returns cached `string[]` of all models across providers (e.g., `["gpt-4o", "ollama@llama3.2", "openrouter@anthropic/claude-3-5-sonnet"]`).

### Obsidian Modal Patterns
- `Modal` base class: `onOpen()` to build UI, `onClose()` to cleanup
- `Setting` component for form fields (text, slider, textarea, toggle, dropdown)
- `Notice` for notifications
- Styling via inline styles or CSS classes

## Integration Points

### Where to Wire the AI Wizard
1. **CreateAgentHandler** needs to pass `services` (or specific services) to the modal for AI calls
2. **CreateAgentModal** needs to be extended or a new modal class created
3. **ServiceContainer** already exposes everything needed: `aiProviderService()`, `apiAuthService`, `settingsService`

### Dependencies for AI Call in Wizard
- `services.aiProviderService()` - creates fresh AI provider
- `services.apiAuthService.getApiKey(settings, providerType)` - gets API key
- `settings.openaiUrl`, `settings.ollamaUrl`, etc. - provider URLs
- `CommandUtilities.getAiApiUrls(frontmatter)` - URL resolution helper

## Architecture Decision

### Approach: Extend CreateAgentModal with a mode selection step

**Pros**: Reuses existing modal UI, keeps it as a single entry point
**Cons**: Slightly more complex modal state management

### Multi-Step Modal Pattern
1. **Step 0**: Mode selection (Manual / AI Wizard)
2. **Step 1 (wizard)**: Model selection + idea description
3. **Step 2 (wizard)**: AI generates → pre-fills manual form
4. **Manual form**: Existing form (name, model, temperature, message) with pre-filled values + Back button

This keeps the CreateAgentModal as the single entry point with internal state management for steps.
