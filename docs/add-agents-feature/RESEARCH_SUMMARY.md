# Research Summary: Add Agents Feature

## Feature Description

Add an "agents" system to ChatGPT MD. Agents are markdown files stored in a configurable folder with frontmatter settings and a prompt body. Users can select agents from a dropdown (like the model selector), create agents via a form, and apply agents to new or existing chats. Templates are kept for backwards compatibility.

## Key Architectural Findings

### 1. Template System is the Blueprint
The existing template system (`TemplateService` + `ChatTemplatesSuggestModal` + `ChooseChatTemplateHandler`) provides the exact pattern to follow. Agents are essentially "smart templates" with more structure.

**Template flow:**
1. Command handler validates folder settings → ensures folder exists
2. `ChatTemplatesSuggestModal` (extends `SuggestModal<ChatTemplate>`) lists files from folder
3. On selection: reads file, checks/adds frontmatter, creates new chat file in chatFolder, opens it

**Agent flow (new):**
1. Command handler validates agentFolder → ensures folder exists
2. `AgentSuggestModal` (extends `SuggestModal<AgentFile>`) lists agent files from folder
3. On selection: reads agent file, separates frontmatter + body, applies frontmatter to current note, inserts body as first message

### 2. Settings Structure
- **Config interface** (`src/Models/Config.ts`): `FolderSettings` has `chatFolder` + `chatTemplateFolder` → add `agentFolder`
- **Default value**: `"ChatGPT_MD/agents"` (follows pattern of `"ChatGPT_MD/chats"`, `"ChatGPT_MD/templates"`)
- **Settings Tab** (`src/Views/ChatGPT_MDSettingsTab.ts`): Add to "Folders" group with same text input pattern

### 3. ServiceContainer Wiring
- Create `AgentService` following `TemplateService` pattern
- Constructor: `(app: App, fileService: FileService, editorService: EditorService, settingsService: SettingsService, frontmatterManager: FrontmatterManager)`
- Wire in `ServiceContainer.create()` after editorService creation
- Expose as `readonly agentService: AgentService`

### 4. Command Registration Pattern
- `CallbackCommandHandler` for "Choose Agent" (no editor needed to open dropdown)
- `CallbackCommandHandler` for "Create Agent" (opens form modal)
- Register via `CommandRegistrar.registerCallbackCommand()`

### 5. Modal Patterns
- **Agent selector**: Extend `SuggestModal<AgentFile>` like `ChatTemplatesSuggestModal` - shows all agents, filters by query
- **Create Agent form**: Extend `Modal` (standard Obsidian Modal) with form fields:
  - Text input for agent name
  - Model dropdown (reuse model list from `ModelSelectHandler`)
  - Temperature slider (0.0 to 2.0)
  - TextArea for agent prompt/message
  - Two buttons: "Create Agent" and "Use Agent"

### 6. Agent File Format
```yaml
---
model: openai@gpt-4o
temperature: 0.7
max_tokens: 2000
system_commands: ['You are a helpful coding assistant.']
---

You are a senior developer. Help me write clean, maintainable code. Ask clarifying questions before implementing.
```
The frontmatter contains the AI configuration; the body is the initial prompt/message.

### 7. Applying Agent to Note
**Empty note:**
1. Write agent's frontmatter to note
2. Insert agent's body as first message
3. Position cursor at end

**Non-empty note:**
1. Merge/replace frontmatter with agent's frontmatter
2. Insert agent's body as first message (after frontmatter, before existing content)
3. Position cursor at end of note

### 8. Frontmatter Operations
- `FrontmatterManager.writeFrontmatter(file, frontmatter)`: Replace entire frontmatter
- `FrontmatterManager.mergeFrontmatter(file, updates)`: Merge fields
- Agent frontmatter should **replace** existing frontmatter (not merge) to ensure clean state

## Files to Create

| File | Purpose |
|------|---------|
| `src/Services/AgentService.ts` | Agent CRUD + application logic |
| `src/Views/AgentSuggestModal.ts` | Agent selection dropdown |
| `src/Views/CreateAgentModal.ts` | Agent creation form |
| `src/Commands/AgentHandlers.ts` | "Choose Agent" + "Create Agent" command handlers |

## Files to Modify

| File | Change |
|------|--------|
| `src/Models/Config.ts` | Add `agentFolder` to `FolderSettings`, `DEFAULT_SETTINGS` |
| `src/Constants.ts` | Add `AGENT_FOLDER_TYPE`, agent command IDs |
| `src/core/ServiceContainer.ts` | Wire `AgentService` |
| `src/main.ts` | Register agent commands |
| `src/Views/ChatGPT_MDSettingsTab.ts` | Add agent folder setting |

## Design Decisions Made

1. **Agent files are standard markdown** - frontmatter for settings, body for prompt
2. **Separate folder from templates** - agents have different purpose (configurable AI personas vs. note structure)
3. **Agent selection replaces frontmatter** - applying an agent sets a clean configuration state
4. **Model dropdown in Create Agent reuses existing model list** - shares `ModelSelectHandler.availableModels`
5. **Templates remain unchanged** - full backwards compatibility

## Integration Risk: Low-Medium

The feature follows all existing patterns closely. Main risks:
- ServiceContainer modification (straightforward, follows TemplateService pattern)
- Settings migration for existing users (handled automatically by DEFAULT_SETTINGS + Object.assign pattern)
- Model list sharing between Create Agent form and ModelSelectHandler (may need to expose model list)
