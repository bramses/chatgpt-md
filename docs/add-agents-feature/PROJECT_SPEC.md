# Project Specification: Add Agents Feature

## 1. Requirements

### User Stories

1. **As a user**, I want to create AI agents with specific configurations (model, temperature, system prompt) so I can quickly switch between different AI personas.

2. **As a user**, I want to select an agent from a dropdown menu and have it applied to my current chat, so I can start using a specific AI configuration immediately.

3. **As a user**, I want to create a new chat with an agent applied, so I can start fresh conversations with specific AI configurations.

4. **As a user**, I want my agents stored in a configurable folder, similar to chat templates, so I can organize them.

5. **As a user**, I want templates to continue working alongside agents for backwards compatibility.

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Agent files are markdown with frontmatter (settings) and body (prompt) | Must |
| FR2 | Agent folder is configurable in plugin settings | Must |
| FR3 | Agent folder is auto-created if it doesn't exist | Must |
| FR4 | "Choose agent" command opens a dropdown showing all agents | Must |
| FR5 | Agent dropdown supports typing to filter agents | Must |
| FR6 | Selecting an agent on empty note: applies frontmatter + inserts body | Must |
| FR7 | Selecting an agent on non-empty note: replaces frontmatter + prepends body | Must |
| FR8 | Cursor positioned at end of note after agent application | Must |
| FR9 | "Create agent" command opens a form with name, model, temperature, message | Must |
| FR10 | Create Agent form has model dropdown using available models | Must |
| FR11 | Create Agent form has temperature slider | Must |
| FR12 | Create Agent form has "Create Agent" button (save only) | Must |
| FR13 | Create Agent form has "Use Agent" button (save + create new chat) | Must |
| FR14 | Templates continue working unchanged | Must |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Follows existing plugin architecture patterns (ServiceContainer, CommandHandler) |
| NFR2 | Functions under 50 lines per coding standards |
| NFR3 | TypeScript strict mode compatible |
| NFR4 | Build passes with `yarn build` |
| NFR5 | Lint passes with `yarn lint` |

## 2. Technical Architecture

### Agent File Format

```markdown
---
model: openai@gpt-4o
temperature: 0.7
max_tokens: 2000
system_commands: ['You are a helpful coding assistant.']
stream: true
---

You are a senior developer. Help me write clean, maintainable code. Ask clarifying questions before implementing.
```

**Frontmatter fields** (all optional except model):
- `model` (string) - AI model identifier with provider prefix
- `temperature` (number) - 0.0 to 2.0
- `max_tokens` (number) - Maximum response tokens
- `system_commands` (string[]) - System prompt(s)
- `stream` (boolean) - Whether to stream responses
- `top_p` (number) - Nucleus sampling
- `frequency_penalty` (number) - Frequency penalty
- `presence_penalty` (number) - Presence penalty

**Body**: Free-form markdown text that becomes the first user message or system context.

### Component Diagram

```
┌──────────────────────────────────────────────────────┐
│                     main.ts                          │
│  ┌───────────────┐  ┌────────────────────┐          │
│  │ChooseAgent    │  │CreateAgent         │          │
│  │Handler        │  │Handler             │          │
│  └───────┬───────┘  └────────┬───────────┘          │
└──────────┼───────────────────┼───────────────────────┘
           │                   │
           ▼                   ▼
┌──────────────────┐  ┌────────────────────┐
│AgentSuggestModal │  │CreateAgentModal    │
│(SuggestModal)    │  │(Modal)             │
└────────┬─────────┘  └────────┬───────────┘
         │                     │
         ▼                     ▼
┌──────────────────────────────────────────┐
│            AgentService                  │
│  - getAgentFiles()                       │
│  - readAgent()                           │
│  - applyAgentToNote()                    │
│  - createAgentFile()                     │
│  - createChatWithAgent()                 │
└──────────────────┬───────────────────────┘
                   │ uses
         ┌─────────┼──────────┐
         ▼         ▼          ▼
   FileService  FrontmatterMgr  EditorService
```

### Data Flow: Choose Agent

```
1. User invokes "Choose agent" command
2. ChooseAgentHandler validates agentFolder setting
3. FileService.ensureFolderExists(agentFolder)
4. Open AgentSuggestModal
5. AgentSuggestModal.getSuggestions() → lists files from agentFolder
6. User types → filters agents by name
7. User selects agent
8. AgentService.applyAgentToNote(agentFile, activeView)
   a. Read agent file (frontmatter + body)
   b. If empty note: write frontmatter, insert body
   c. If non-empty: replace frontmatter, prepend body after frontmatter
   d. Move cursor to end
```

### Data Flow: Create Agent

```
1. User invokes "Create agent" command
2. CreateAgentHandler validates agentFolder setting
3. FileService.ensureFolderExists(agentFolder)
4. Open CreateAgentModal with available models
5. User fills form: name, model, temperature, message
6. User clicks "Create Agent":
   a. AgentService.createAgentFile(name, model, temp, message)
   b. File created in agentFolder
   c. Modal closes
7. OR User clicks "Use Agent":
   a. AgentService.createAgentFile(name, model, temp, message)
   b. AgentService.createChatWithAgent(agentFile, settings)
   c. New chat opened with agent applied
   d. Modal closes
```

## 3. File-by-File Specification

### New Files

#### `src/Services/AgentService.ts`
- **Purpose:** Agent CRUD operations and application logic
- **Dependencies:** App, FileService, EditorService, SettingsService, FrontmatterManager
- **Lines estimate:** ~120 lines (5 methods, each under 50 lines)

#### `src/Views/AgentSuggestModal.ts`
- **Purpose:** Dropdown for selecting agents
- **Pattern:** Extends `SuggestModal<AgentItem>`
- **Dependencies:** App, AgentService, SettingsService
- **Lines estimate:** ~60 lines

#### `src/Views/CreateAgentModal.ts`
- **Purpose:** Form for creating new agents
- **Pattern:** Extends `Modal`
- **Dependencies:** App, AgentService, SettingsService, available models
- **Lines estimate:** ~100 lines

#### `src/Commands/AgentHandlers.ts`
- **Purpose:** Command handlers for agent operations
- **Pattern:** Implements `CallbackCommandHandler`
- **Dependencies:** ServiceContainer, ModelSelectHandler
- **Lines estimate:** ~60 lines

### Modified Files

#### `src/Models/Config.ts`
- Add to `FolderSettings`: `agentFolder: string`
- Add to `DEFAULT_SETTINGS`: `agentFolder: "ChatGPT_MD/agents"`

#### `src/Constants.ts`
- Add: `AGENT_FOLDER_TYPE = "agentFolder"`
- Add: `CHOOSE_AGENT_COMMAND_ID = "choose-agent"`
- Add: `CREATE_AGENT_COMMAND_ID = "create-agent"`

#### `src/core/ServiceContainer.ts`
- Import AgentService
- Add `readonly agentService: AgentService` property
- Wire in `create()` method
- Update constructor

#### `src/main.ts`
- Import AgentHandlers
- Register agent commands in `registerCommands()`

#### `src/Views/ChatGPT_MDSettingsTab.ts`
- Add agent folder setting to "Folders" group

#### `src/Commands/ModelSelectHandler.ts`
- Add `getAvailableModels(): string[]` public method

## 4. Edge Cases & Error Handling

| Scenario | Behavior |
|----------|----------|
| Agent folder doesn't exist | Prompt user to create (existing pattern via `createFolderModal`) |
| Agent folder is empty | Show empty dropdown with placeholder text |
| Agent file has no frontmatter | Use default frontmatter from settings |
| Agent file has no body | Apply frontmatter only, no message inserted |
| Agent name contains invalid chars | Sanitize via `FileService.sanitizeFileName()` |
| Agent name already exists | Append number suffix: `Agent Name (1).md` |
| No models available for Create form | Show text input for model instead of dropdown |
| Applying agent to note fails | Show error Notice, log to console |
| agentFolder setting empty | Show Notice asking user to set it |
