# Implementation Plan: Add Agents Feature

## Overview

Add an agents system to ChatGPT MD that allows users to create, manage, and apply AI agent configurations. Agents are markdown files with frontmatter settings and a prompt body, stored in a configurable folder.

## Phase 1: Core Infrastructure (Settings, Constants, Types)

### Task 1.1: Add Agent Constants
**File:** `src/Constants.ts`
- Add `AGENT_FOLDER_TYPE = "agentFolder"` constant
- Add `CHOOSE_AGENT_COMMAND_ID = "choose-agent"` command ID
- Add `CREATE_AGENT_COMMAND_ID = "create-agent"` command ID

### Task 1.2: Add Agent Settings
**File:** `src/Models/Config.ts`
- Add `agentFolder: string` to `FolderSettings` interface
- Add `agentFolder: "ChatGPT_MD/agents"` to `DEFAULT_SETTINGS`

### Task 1.3: Add Agent Folder to Settings Tab
**File:** `src/Views/ChatGPT_MDSettingsTab.ts`
- Add agent folder setting to the "Folders" group in `settingsSchema` array:
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
- Insert after the chatTemplateFolder setting

## Phase 2: Agent Service

### Task 2.1: Create AgentService
**File:** `src/Services/AgentService.ts` (NEW)

**Constructor dependencies:** `(app: App, fileService: FileService, editorService: EditorService, settingsService: SettingsService, frontmatterManager: FrontmatterManager)`

**Methods:**

1. `getAgentFiles(settings: ChatGPT_MDSettings): TFile[]`
   - Get all markdown files from `settings.agentFolder`
   - Pattern: Same as `ChatTemplatesSuggestModal.getFilesInChatFolder()`

2. `readAgent(file: TFile): Promise<{ frontmatter: Record<string, unknown>; body: string }>`
   - Read agent file content
   - Parse frontmatter and body separately
   - Return structured agent data

3. `applyAgentToNote(agentFile: TFile, view: MarkdownView): Promise<void>`
   - Read agent data (frontmatter + body)
   - If note is empty (no content after frontmatter):
     - Write agent frontmatter
     - Insert agent body as first message
   - If note has content:
     - Replace/merge frontmatter with agent's frontmatter
     - Prepend agent body as first message (after frontmatter, before existing content)
   - Move cursor to end of note

4. `createAgentFile(name: string, model: string, temperature: number, message: string): Promise<TFile>`
   - Generate frontmatter from model, temperature
   - Combine frontmatter + message body
   - Create file in agentFolder
   - Return created file

5. `createChatWithAgent(agentFile: TFile, settings: ChatGPT_MDSettings): Promise<void>`
   - Create new chat file in chatFolder
   - Apply agent's frontmatter and body
   - Open the new file
   - Position cursor at end

### Task 2.2: Wire AgentService in ServiceContainer
**File:** `src/core/ServiceContainer.ts`
- Import AgentService
- Add `readonly agentService: AgentService` property
- Create instance in `ServiceContainer.create()` after editorService/templateService:
  ```typescript
  const agentService = new AgentService(app, fileService, editorService, settingsService, frontmatterManager);
  ```
- Add to constructor parameters and assignment
- Add to return statement

## Phase 3: UI Components (Modals)

### Task 3.1: Create AgentSuggestModal
**File:** `src/Views/AgentSuggestModal.ts` (NEW)

**Pattern:** Follow `ChatTemplatesSuggestModal` and `AiModelSuggestModal`

```typescript
interface AgentItem {
  title: string;
  file: TFile;
}

class AgentSuggestModal extends SuggestModal<AgentItem> {
  constructor(app, agentService, settingsService, editorService);
  getSuggestions(query): AgentItem[];     // All agents when empty, filtered when typing
  renderSuggestion(agent, el): void;      // Show agent name
  onChooseSuggestion(agent, evt): void;   // Apply agent to current note or create new chat
}
```

**Behavior:**
- Shows all agents from agent folder when opened (empty query)
- Typing filters by agent name (case-insensitive, like model selector)
- On selection: applies agent to current active note
- Uses `agentService.applyAgentToNote()` for the actual application

### Task 3.2: Create CreateAgentModal
**File:** `src/Views/CreateAgentModal.ts` (NEW)

**Pattern:** Extend `Modal` (standard Obsidian Modal, not SuggestModal)

**Form fields:**
1. **Agent Name** - Text input
2. **Model** - Dropdown using available models (from ModelSelectHandler's cached model list)
3. **Temperature** - Slider (0.0 to 2.0, step 0.1) with numeric display
4. **Agent Message** - TextArea for the agent's prompt/body

**Buttons:**
1. **Create Agent** - Creates agent file in agentFolder only
2. **Use Agent** - Creates agent file AND creates a new chat with the agent applied

**Constructor:** `(app: App, agentService: AgentService, settingsService: SettingsService, availableModels: string[])`

**Implementation details:**
- Model dropdown populated from `availableModels` parameter
- Temperature slider uses Obsidian's `Setting.addSlider()` API
- TextArea uses `Setting.addTextArea()` with sufficient height
- On "Create Agent": call `agentService.createAgentFile()`, close modal
- On "Use Agent": call `agentService.createAgentFile()`, then `agentService.createChatWithAgent()`, close modal

## Phase 4: Command Handlers & Registration

### Task 4.1: Create AgentHandlers
**File:** `src/Commands/AgentHandlers.ts` (NEW)

**ChooseAgentHandler** (implements `CallbackCommandHandler`):
- Command ID: `CHOOSE_AGENT_COMMAND_ID` ("choose-agent")
- Name: "Choose agent"
- Icon: "bot"
- `execute()`:
  1. Validate agentFolder setting exists
  2. Ensure agentFolder exists via `fileService.ensureFolderExists()`
  3. Open `AgentSuggestModal`

**CreateAgentHandler** (implements `CallbackCommandHandler`):
- Command ID: `CREATE_AGENT_COMMAND_ID` ("create-agent")
- Name: "Create new agent"
- Icon: "bot-message-square"
- `execute()`:
  1. Validate agentFolder setting exists
  2. Ensure agentFolder exists
  3. Get available models from ModelSelectHandler
  4. Open `CreateAgentModal`

### Task 4.2: Register Commands in main.ts
**File:** `src/main.ts`
- Import `ChooseAgentHandler` and `CreateAgentHandler` from `src/Commands/AgentHandlers`
- In `registerCommands()`:
  ```typescript
  // Agent commands
  registrar.registerCallbackCommand(new ChooseAgentHandler(this.services, this.modelSelectHandler));
  registrar.registerCallbackCommand(new CreateAgentHandler(this.services, this.modelSelectHandler));
  ```

### Task 4.3: Share Model List
The `ModelSelectHandler` needs to expose its `availableModels` for the Create Agent form.
**File:** `src/Commands/ModelSelectHandler.ts`
- Add `getAvailableModels(): string[]` method that returns `this.availableModels`

## Testing Strategy

### Manual Testing
1. **Settings**: Verify agent folder setting appears in settings tab, saves/loads correctly
2. **Folder creation**: Verify agent folder is created if missing when commands are invoked
3. **Create Agent**: Fill form, verify agent file created with correct frontmatter + body
4. **Choose Agent (empty note)**: Select agent, verify frontmatter applied and body inserted
5. **Choose Agent (non-empty note)**: Select agent, verify frontmatter replaced and body prepended
6. **Use Agent**: Verify new chat created with agent configuration
7. **Agent dropdown**: Verify all agents shown, filtering works
8. **Templates**: Verify templates still work unchanged

### Unit Tests (if applicable)
- Test agent file parsing (frontmatter + body separation)
- Test frontmatter generation for agents

## Dependencies Between Phases

```
Phase 1 (Infrastructure) → Phase 2 (Service) → Phase 3 (UI) → Phase 4 (Commands)
```

Each phase depends on the previous one. Phase 1 must complete before Phase 2 can start.
