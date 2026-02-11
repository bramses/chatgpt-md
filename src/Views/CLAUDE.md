# UI Components

All user interface components and modals. Uses Obsidian's Modal and SuggestModal APIs.

## Tool Calling Modals (v3.0)

### BaseApprovalModal.ts

**Abstract base class for approval modals**

Common functionality for all tool approval flows:

- Two-button layout (Approve/Reject)
- Editable parameters
- Result display and selection

### ToolApprovalModal.ts

**Interactive modal for approving tool execution requests**

Shown when AI requests to use a tool. User can:

- Approve execution
- Modify parameters (e.g., search query) before approval
- Reject the request

### SearchResultsApprovalModal.ts

**Review and filter vault search results**

After vault search executes, user selects which files to share with AI:

- Multi-select checkboxes
- File preview
- Choose what to share back to AI

### WebSearchApprovalModal.ts

**Review and filter web search results**

After web search executes, user selects which results to share with AI:

- Multi-select checkboxes
- Result preview (title, snippet, URL)
- Choose what to share back to AI

## Agent Modals

### AgentSuggestModal.ts

**Agent selection modal**

Extends `SuggestModal<AgentItem>`

- Lists agents from configured agent folder (alphabetically sorted)
- Fuzzy search filtering by agent name
- On selection: sets `agent` frontmatter field in the active note via `SettingsService.updateFrontmatterField()`

### CreateAgentModal.ts

**Agent creation modal with multi-step wizard**

Extends `Modal`

Four wizard steps (`WizardStep` type):

1. **`mode-select`**: Choose between "Manual" (configure everything) or "AI Wizard" (describe idea, AI creates)
2. **`wizard-input`**: Select AI model + describe agent idea in textarea
3. **`wizard-loading`**: Loading spinner while AI generates configuration
4. **`manual-form`**: Form with name, model (with autocomplete), temperature slider, and system prompt textarea

**AI Wizard flow**: Calls `AiProviderService.callAiAPI()` with `AGENT_WIZARD_SYSTEM_PROMPT` → parses JSON response (`{name, temperature, prompt}`) → pre-fills manual form for review

- Model selection uses inline suggestions (filterable dropdown from available models list)
- `parseWizardResponse()` handles both clean JSON and JSON embedded in markdown code fences
- Falls back to manual form if AI unavailable or no models loaded

## Model Selection

### AiModelSuggestModal.ts

**Model selection modal** (note: file name is `AiModelSuggestModel.ts`)

Extends Obsidian's `SuggestModal<string>`

Features:

- Shows all available models from configured services
- Supports fuzzy search
- Prefixes models with service name (e.g., `ollama@llama3.2`)
- Updates note frontmatter when model selected

Behavior:

- Opens immediately with cached models
- Fetches fresh models in background
- Refreshes modal if models changed

## Templates

### ChatTemplatesSuggestModal.ts

**Template selection modal**

Extends `SuggestModal<TFile>`

- Lists templates from configured folder
- Creates new note from selected template
- Merges template frontmatter with defaults

## Settings

### ChatGPT_MDSettingsTab.ts

**Plugin settings UI**

Extends `PluginSettingTab`

Settings organized in sections:

**API Keys**: OpenAI, OpenRouter, Anthropic, Gemini

**Service URLs**: Per-provider base URLs with defaults

**Default Models**: Per-provider default model selection

**Default Parameters**: Temperature, max_tokens, top_p per provider

**Chat Behavior**: Stream toggle, cursor position, auto title inference

**Tool Calling**: Enable/disable, Brave API key, custom provider URL

**Folders**: Chat folder, template folder, agent folder paths

**Formatting**: Date format, heading level, title inference language

## Utility Modals

### FolderCreationModal.ts

**Folder creation prompt**

Asks user to create missing folders when chat/template folder doesn't exist.

## Modal Patterns

### SuggestModal Pattern

```typescript
class MyModal extends SuggestModal<T> {
  getSuggestions(query: string): T[];
  renderSuggestion(item: T, el: HTMLElement): void;
  onChooseSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void;
}
```

### Standard Modal Pattern

```typescript
class MyModal extends Modal {
  onOpen(): void; // Build UI
  onClose(): void; // Cleanup
}
```

## Obsidian API Quick Reference

**Editor**:

- `editor.getCursor()` / `setCursor(pos)`
- `editor.replaceRange(text, from, to)`
- `editor.getValue()` / `getLine(n)`

**Vault**:

- `app.vault.read(file)` / `modify(file, content)`
- `app.vault.create(path, content)`

**Metadata**:

- `app.metadataCache.getFileCache(file)`
