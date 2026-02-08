# Plan Summary: Add Agents Feature

## Implementation Overview

4 phases, 10 tasks, 4 new files, 6 modified files.

## Phase 1: Core Infrastructure

### Task 1.1 - Constants (`src/Constants.ts`)
Add 3 constants:
```typescript
export const AGENT_FOLDER_TYPE = "agentFolder";
export const CHOOSE_AGENT_COMMAND_ID = "choose-agent";
export const CREATE_AGENT_COMMAND_ID = "create-agent";
```

### Task 1.2 - Settings (`src/Models/Config.ts`)
- Add `agentFolder: string` to `FolderSettings` interface (after `chatTemplateFolder`)
- Add `agentFolder: "ChatGPT_MD/agents"` to `DEFAULT_SETTINGS` (in Folders section)

### Task 1.3 - Settings Tab (`src/Views/ChatGPT_MDSettingsTab.ts`)
Add to `settingsSchema` array in Folders group (after chatTemplateFolder entry):
```typescript
{
  id: "agentFolder",
  name: "Agent Folder",
  description: "Path to folder for agent files",
  type: "text",
  placeholder: "ChatGPT_MD/agents",
  group: "Folders",
}
```

## Phase 2: Agent Service

### Task 2.1 - Create `src/Services/AgentService.ts` (NEW)
**Dependencies:** `App, FileService, EditorService, SettingsService, FrontmatterManager`

**5 methods:**
1. `getAgentFiles(settings)` → `TFile[]` - List files from agentFolder
2. `readAgent(file)` → `{ frontmatter, body }` - Parse agent file
3. `applyAgentToNote(agentFile, view)` → Apply agent to current note
4. `createAgentFile(name, model, temperature, message)` → `TFile` - Create new agent
5. `createChatWithAgent(agentFile, settings)` → Create new chat with agent applied

**Agent application logic:**
- Empty note: write frontmatter + insert body
- Non-empty note: replace frontmatter + prepend body after frontmatter
- Always: move cursor to end

### Task 2.2 - Wire in `src/core/ServiceContainer.ts`
- Import AgentService
- Add `readonly agentService: AgentService`
- Create in `create()`: `const agentService = new AgentService(app, fileService, editorService, settingsService, frontmatterManager);`
- Add to constructor params and return

## Phase 3: UI Components

### Task 3.1 - Create `src/Views/AgentSuggestModal.ts` (NEW)
- Extends `SuggestModal<AgentItem>` where `AgentItem = { title: string; file: TFile }`
- `getSuggestions(query)`: All agents when empty, filtered by name when typing
- `renderSuggestion(agent, el)`: Shows agent name
- `onChooseSuggestion(agent)`: Calls `agentService.applyAgentToNote()`

### Task 3.2 - Create `src/Views/CreateAgentModal.ts` (NEW)
- Extends `Modal`
- Form: name (text), model (dropdown), temperature (slider 0-2), message (textarea)
- "Create Agent" button: saves file only
- "Use Agent" button: saves file + creates new chat with agent

## Phase 4: Commands & Registration

### Task 4.1 - Create `src/Commands/AgentHandlers.ts` (NEW)
Two handlers implementing `CallbackCommandHandler`:

**ChooseAgentHandler:**
- ID: "choose-agent", name: "Choose agent", icon: "bot"
- Validates folder → opens `AgentSuggestModal`

**CreateAgentHandler:**
- ID: "create-agent", name: "Create new agent", icon: "bot-message-square"
- Validates folder → opens `CreateAgentModal` with available models

### Task 4.2 - Register in `src/main.ts`
```typescript
registrar.registerCallbackCommand(new ChooseAgentHandler(this.services, this.modelSelectHandler));
registrar.registerCallbackCommand(new CreateAgentHandler(this.services, this.modelSelectHandler));
```

### Task 4.3 - Expose models in `src/Commands/ModelSelectHandler.ts`
Add public method: `getAvailableModels(): string[]` returning `this.availableModels`

## Verification Checklist
- [ ] `yarn build` passes
- [ ] `yarn lint` passes
- [ ] Agent folder setting visible in settings tab
- [ ] Create Agent command works with form
- [ ] Choose Agent dropdown lists agents and filters
- [ ] Agent application works on empty notes
- [ ] Agent application works on non-empty notes
- [ ] "Use Agent" creates new chat with agent
- [ ] Templates still work unchanged
