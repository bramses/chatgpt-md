# Implementation Plan: AI Agent Wizard

## Phase 1: Update CreateAgentHandler to pass services

**File**: `src/Commands/AgentHandlers.ts`

### Changes
- Pass `ServiceContainer` (or specific services needed) to `CreateAgentModal` so it can make AI calls
- Specifically need: `aiProviderService` factory, `apiAuthService`, `settingsService`

```typescript
// Before
new CreateAgentModal(this.services.app, agentService, settings, availableModels).open();

// After
new CreateAgentModal(
  this.services.app,
  agentService,
  settings,
  availableModels,
  this.services  // pass services for AI wizard
).open();
```

## Phase 2: Add AI Wizard System Prompt constant

**File**: `src/Constants.ts`

### Changes
Add the comprehensive system prompt for the AI agent wizard:

```typescript
export const AGENT_WIZARD_SYSTEM_PROMPT = `You are an AI agent creation wizard...`;
```

The system prompt should instruct the model to:
1. Analyze the user's description
2. Return valid JSON with exactly three fields: `name`, `temperature`, `prompt`
3. Guidelines for temperature selection (0-0.3 factual, 0.4-0.7 balanced, 0.8-1.2 creative, 1.3-2.0 highly experimental)
4. Guidelines for prompt creation (role definition, capabilities, constraints, tone, format)
5. Name should be concise (2-4 words) and descriptive

## Phase 3: Refactor CreateAgentModal into multi-step wizard

**File**: `src/Views/CreateAgentModal.ts`

### Architecture
Add internal state machine with steps:
- `mode-select` → `wizard-input` → `wizard-loading` → `manual-form`
- `mode-select` → `manual-form` (direct manual path)
- `manual-form` → `wizard-input` (back from pre-filled form)

### New private fields
```typescript
private step: 'mode-select' | 'wizard-input' | 'wizard-loading' | 'manual-form' = 'mode-select';
private wizardModel = '';        // model chosen for AI generation
private wizardIdea = '';         // user's agent idea text
private services?: ServiceContainer;
```

### Step Rendering Methods

#### `renderModeSelect(container)`
- Title: "Create New Agent"
- Two card-style buttons:
  - "Manual" with icon + description "Configure everything yourself"
  - "AI Wizard" with icon + description "Describe your idea, AI creates the agent"

#### `renderWizardInput(container)`
- Title: "AI Agent Wizard"
- Model selector (reuse existing autocomplete pattern)
- Textarea: "Describe your agent idea..."
- Buttons: "Back" (→ mode-select) | "Create with AI" (→ wizard-loading → generates → manual-form)

#### `renderWizardLoading(container)`
- Title: "Creating your agent..."
- Spinner/loading indicator
- Descriptive text: "AI is crafting your agent's configuration..."

#### `renderManualForm(container)` (existing, extracted)
- The existing form fields (name, model, temperature, message)
- Pre-filled with AI values when coming from wizard
- Buttons: "Back" (→ wizard-input) | "Create Agent"
- The "Back" button only shown when `cameFromWizard` is true

### AI Generation Method

#### `generateAgentWithAI()`
1. Get provider type from wizard model prefix
2. Get API key from `apiAuthService`
3. Get URL from settings
4. Create `AiProviderService` via factory
5. Call `callAiAPI` in non-streaming mode with:
   - System message: `AGENT_WIZARD_SYSTEM_PROMPT`
   - User message: the wizard idea text
6. Parse JSON response
7. Pre-fill form fields: `this.name`, `this.model`, `this.temperature`, `this.message`
8. Navigate to manual-form step
9. Error handling: show Notice, stay on wizard-input step

### Step Navigation
```typescript
private navigateTo(step: Step): void {
  this.step = step;
  this.contentEl.empty();
  this.render();
}
```

### Constructor Update
```typescript
constructor(
  app: App,
  private agentService: AgentService,
  private settings: ChatGPT_MDSettings,
  private availableModels: string[],
  private services?: ServiceContainer  // optional for backward compat
)
```

## Phase 4: Implement the AI call

### Method: `generateAgentWithAI()`

Key implementation details:
- Use `services.aiProviderService()` to create fresh provider
- Determine provider type from model prefix (e.g., `ollama@` → ollama)
- Get API key via `services.apiAuthService.getApiKey(settings, providerType)`
- Get URL from settings based on provider
- Build messages: system prompt + user idea
- Call non-streaming `callAiAPI` with `stream: false`
- Parse JSON from response (handle markdown code fences in response)
- Validate response has required fields
- Handle errors gracefully

### JSON Parsing Safety
```typescript
private parseWizardResponse(response: string): { name: string; temperature: number; prompt: string } | null {
  // Strip markdown code fences if present
  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.name && typeof parsed.temperature === 'number' && parsed.prompt) {
      return parsed;
    }
  } catch { /* fall through */ }
  return null;
}
```

## Phase 5: CSS Styling

Add minimal inline styles for:
- Mode selection cards (flex layout, hover effects)
- Loading spinner animation
- Step transition smoothness

Keep consistent with existing Obsidian modal patterns and the plugin's existing inline styling approach.

## Implementation Order

1. Phase 2: Add constants (system prompt) - no dependencies
2. Phase 1: Update handler to pass services - simple change
3. Phase 3: Refactor modal with multi-step flow
4. Phase 4: Implement AI call within modal
5. Phase 5: Polish styling

## Testing Strategy

- Manual testing: Test both manual and wizard flows
- Test wizard with different providers (OpenAI, Ollama, etc.)
- Test error cases: invalid JSON response, network errors, missing API key
- Test back navigation preserves state
- Verify created agent files are valid (proper frontmatter + body)
- Build validation: `yarn build && yarn lint`
