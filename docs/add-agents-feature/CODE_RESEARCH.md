# Code Research: Add Agents Feature

## 1. Architecture Overview

The ChatGPT MD plugin uses a **ServiceContainer** pattern with constructor injection. All services are created in `ServiceContainer.create()` (`src/core/ServiceContainer.ts`) and accessed as readonly properties.

### Key Services
- **SettingsService** (`src/Services/SettingsService.ts`) - Settings persistence, frontmatter operations
- **EditorService** (`src/Services/EditorService.ts`) - Editor operations, cursor management, content insertion
- **TemplateService** (`src/Services/TemplateService.ts`) - Template loading and chat creation from templates
- **FileService** (`src/Services/FileService.ts`) - File/folder operations, folder creation
- **FrontmatterManager** (`src/Services/FrontmatterManager.ts`) - YAML frontmatter CRUD operations
- **NotificationService** (`src/Services/NotificationService.ts`) - User notifications

### Command System
- **CommandHandler interface** (`src/Commands/CommandHandler.ts`): `EditorCommandHandler`, `EditorViewCommandHandler`, `CallbackCommandHandler`
- **CommandRegistrar** (`src/Commands/CommandRegistrar.ts`): Registers commands via `registerEditorCommand`, `registerEditorViewCommand`, `registerCallbackCommand`
- Commands registered in `main.ts:registerCommands()`

## 2. Template System (Existing Pattern to Follow)

### Template Folder Setting
- Setting: `chatTemplateFolder` in `ChatGPT_MDSettings` (`src/Models/Config.ts:63-64`)
- Default: `"ChatGPT_MD/templates"` (`src/Models/Config.ts:281`)
- Settings UI: Text input in "Folders" group (`src/Views/ChatGPT_MDSettingsTab.ts:376-383`)

### Template Service (`src/Services/TemplateService.ts`)
- Constructor: `(app: App, fileService: FileService, editorService: EditorService)`
- `createNewChatFromTemplate(settings, fileName)`:
  1. Validates chatFolder and chatTemplateFolder settings exist
  2. Ensures both folders exist via `fileService.ensureFolderExists()`
  3. Opens `ChatTemplatesSuggestModal`

### Template Suggest Modal (`src/Views/ChatTemplatesSuggestModal.ts`)
- Extends `SuggestModal<ChatTemplate>` where `ChatTemplate = { title: string; file: TFile }`
- `getFilesInChatFolder()`: Gets files from template folder via `app.vault.getAbstractFileByPath()`
- `getSuggestions(query)`: Shows all templates when query empty, filters by basename when typing
- `onChooseSuggestion(template)`:
  1. Reads template file content
  2. Checks if template has frontmatter; adds default if missing
  3. Creates new file in chatFolder with name `{date} {templateName}.md`
  4. Opens the new file

### Template Command Handler (`src/Commands/RemainingHandlers.ts:36-57`)
- `ChooseChatTemplateHandler` implements `CallbackCommandHandler`
- Command ID: `CHOOSE_CHAT_TEMPLATE_COMMAND_ID = "choose-chat-template"`
- Validates dateFormat, then calls `editorService.createNewChatFromTemplate()`

## 3. Model Selection System (Dropdown Pattern to Reuse)

### AiModelSuggestModal (`src/Views/AiModelSuggestModel.ts`)
- Extends `SuggestModal<string>`
- Constructor: `(app, editor, editorService, modelNames[], settings)`
- `getSuggestions(query)`: Case-insensitive filter on model names
- `renderSuggestion(model, el)`: Shows model name + optional "Tools" badge
- `onChooseSuggestion(modelName)`: Updates frontmatter via `editorService.setModel()`
- Uses `this.limit = this.modelNames.length` to show all items

### Model Fetching (`src/Commands/ModelSelectHandler.ts`)
- Cached models shown immediately, fresh models fetched in background
- `initializeAvailableModels()`: Fetches from all providers on startup
- `execute()`: Opens modal with cached, fetches fresh, reopens if changed

## 4. Settings System

### Settings Interface (`src/Models/Config.ts`)
- `ChatGPT_MDSettings` extends multiple sub-interfaces
- `FolderSettings`: `chatFolder: string`, `chatTemplateFolder: string`
- Need to add: `agentFolder: string`

### Default Settings (`src/Models/Config.ts:262-347`)
- `chatFolder: "ChatGPT_MD/chats"`, `chatTemplateFolder: "ChatGPT_MD/templates"`
- Pattern for new folder: `agentFolder: "ChatGPT_MD/agents"`

### Settings Tab (`src/Views/ChatGPT_MDSettingsTab.ts`)
- Data-driven with `SettingDefinition[]` schema
- Groups: "API Keys", "Chat Behavior", provider groups (collapsible), "Folders", "Formatting", "Tool Calling"
- Folder settings at lines 368-383

### Settings Service (`src/Services/SettingsService.ts`)
- `generateFrontmatter(additionalSettings)`: Generates YAML frontmatter string
- `updateFrontmatterField(editor, key, value)`: Updates single frontmatter field on active file
- `getFrontmatter(view)`: Reads and merges frontmatter with settings

## 5. Frontmatter System

### FrontmatterManager (`src/Services/FrontmatterManager.ts`)
- `readFrontmatter(file)`: Returns `Record<string, any> | null`
- `writeFrontmatter(file, frontmatter)`: Replaces entire frontmatter
- `mergeFrontmatter(file, updates)`: Merges fields into existing
- `updateFrontmatterField(file, key, value)`: Updates single field
- Uses Obsidian's `app.fileManager.processFrontMatter()` and `app.metadataCache.getFileCache()`

### MergedFrontmatterConfig (`src/Models/Config.ts:238-257`)
```typescript
interface MergedFrontmatterConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  stream: boolean;
  aiService: string;
  url: string;
  system_commands?: string[] | null;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  [key: string]: unknown;
}
```

## 6. File/Folder Operations

### FileService (`src/Services/FileService.ts`)
- `ensureFolderExists(folderPath, folderType)`: Checks existence, shows creation modal if missing
- `createNewFile(filePath, content)`: Creates file via `app.vault.create()`
- `readFile(file)`: Reads file content
- `formatDate(date, format)`: Formats date for filenames
- `sanitizeFileName(fileName)`: Removes invalid chars

### Folder Type Constants (`src/Constants.ts:56-57`)
- `CHAT_FOLDER_TYPE = "chatFolder"`
- `CHAT_TEMPLATE_FOLDER_TYPE = "chatTemplateFolder"`
- Need to add: `AGENT_FOLDER_TYPE = "agentFolder"`

## 7. Editor Operations

### EditorService (`src/Services/EditorService.ts`)
- `moveCursorToEnd(editor)`: Moves cursor to end of document
- `setModel(editor, modelName)`: Updates frontmatter model field
- `clearChat(editor)`: Clears content preserving frontmatter
- `createNewChatFromTemplate(settings, fileName)`: Delegates to TemplateService
- `getFrontmatter(view, settings, app)`: Gets merged frontmatter config

### Key Obsidian Editor APIs
- `editor.getValue()` / `editor.setValue(text)`: Get/set full content
- `editor.getCursor()` / `editor.setCursor(pos)`: Cursor position
- `editor.lastLine()`: Last line number
- `editor.replaceRange(text, from, to)`: Insert/replace text
- `app.workspace.openLinkText(name, "", true)`: Open file in new tab

## 8. Plugin Entry Point (`src/main.ts`)

### onload() Flow
1. `ServiceContainer.create(app, this)` - Create all services
2. `settingsService.loadSettings()` - Load persisted settings
3. `settingsService.migrateSettings()` - Run migrations
4. `settingsService.addSettingTab()` - Register settings UI
5. Create command handlers with constructor injection
6. `registerCommands()` - Register all commands
7. Background: `modelSelectHandler.initializeAvailableModels()`

### registerCommands() Pattern
- Some commands use `registrar.registerEditorCommand()` / `registerCallbackCommand()`
- Some use `this.addCommand()` directly for more control (ChatHandler, ModelSelectHandler)

## 9. Risk Assessment

### Risk Level: Medium

**Risks:**
1. **ServiceContainer coupling**: Adding a new AgentService requires modifying ServiceContainer.create() and the constructor
2. **Settings migration**: Adding new settings fields needs migration handling for existing users
3. **Frontmatter merging**: Agent frontmatter needs to work correctly with the existing merge priority system
4. **Template backwards compatibility**: Templates must continue working alongside agents

**Mitigations:**
1. Follow existing patterns exactly (TemplateService pattern for AgentService)
2. Use DEFAULT_SETTINGS with new fields (migration will auto-apply defaults)
3. Use FrontmatterManager.mergeFrontmatter() which handles merging properly
4. Keep templates as-is, agents are a separate system

## 10. Integration Points

### Files to Create
1. `src/Services/AgentService.ts` - Agent management service
2. `src/Views/AgentSuggestModal.ts` - Agent selection dropdown
3. `src/Views/CreateAgentModal.ts` - Agent creation form
4. `src/Commands/AgentHandlers.ts` - Command handlers for agent operations

### Files to Modify
1. `src/Models/Config.ts` - Add `agentFolder` to FolderSettings, add to DEFAULT_SETTINGS
2. `src/Constants.ts` - Add agent-related command IDs and folder type constant
3. `src/core/ServiceContainer.ts` - Wire AgentService
4. `src/main.ts` - Register agent commands
5. `src/Views/ChatGPT_MDSettingsTab.ts` - Add agent folder setting to Folders group

## 11. Questions for Planning

1. Should agents reuse the existing `chatFolder` for created chats, or should agents create chats in a separate folder?
2. What frontmatter fields should agents support? The full set (model, temperature, max_tokens, etc.) or a subset?
3. Should agent files have a specific extension or naming convention?
4. When applying an agent to a non-empty note, should existing frontmatter be replaced or merged?
5. Should the "Use Agent" button in the create form create the chat in the chatFolder or agentFolder?
