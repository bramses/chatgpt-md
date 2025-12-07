# UI Components

All user interface components and modals.

## AiModelSuggestModal.ts

**Model selection modal**

Extends Obsidian's `SuggestModal<string>`

Features:

- Shows all available models from configured services
- Supports fuzzy search
- Prefixes models with service name (e.g., `ollama@llama3.2`, `openrouter@anthropic/claude-3.5-sonnet`)
- Updates note frontmatter when model selected

Behavior:

- Opens immediately with cached models (instant UX)
- Fetches fresh models in background
- Refreshes modal if models changed
- 6 second timeout per service

## ChatTemplatesSuggestModal.ts

**Template selection modal**

Extends `SuggestModal<TFile>`

Features:

- Lists templates from configured folder (`settings.chatTemplateFolder`)
- Shows template filenames
- Creates new note from selected template
- Merges template frontmatter with defaults

Flow:

1. User selects template
2. New note created with timestamp name (or custom)
3. Template content + frontmatter copied
4. Note opened in editor

## ChatGPT_MDSettingsTab.ts

**Plugin settings UI**

Extends `PluginSettingTab`

Settings organized in sections:

### API Keys

- OpenAI API key
- OpenRouter API key
- Anthropic API key
- Gemini API key

### Service URLs

- OpenAI URL (default: `https://api.openai.com`)
- OpenRouter URL (default: `https://openrouter.ai`)
- Ollama URL (default: `http://localhost:11434`)
- LM Studio URL (default: `http://localhost:1234`)
- Anthropic URL
- Gemini URL

### Default Models per Provider

- OpenAI default model
- OpenRouter default model
- Ollama default model
- LM Studio default model
- Anthropic default model
- Gemini default model

### Default Parameters per Provider

- Temperature, max_tokens, top_p
- Presence/frequency penalty (if supported)

### Chat Behavior

- Stream responses (toggle)
- Generate at cursor vs end of file (toggle)
- Auto infer title after 4 messages (toggle)
- Plugin system message (textarea)

### Folders

- Chat folder path (for new chats)
- Template folder path (for templates)

### Formatting

- Date format (for timestamp chat names)
- Heading level (1-6, for messages)
- Title inference language

## FolderCreationModal.ts

**Folder creation prompt**

Extends `Modal`

Features:

- Asks user to create missing folders
- Used when chat folder or template folder doesn't exist
- Validates folder paths
- Creates folders on confirmation

Used by:

- EditorService when creating new chats
- TemplateService when accessing templates

## Platform-Specific UI Considerations

### Desktop

- Status bar updates for operations
- Notice popups for important messages
- Full modal support
- Console logging available

### Mobile

- Primarily Notice popups (status bar less visible)
- Modal support with touch optimization
- Limited console access

### Implementation Pattern

```typescript
import { Platform } from "obsidian";

if (Platform.isMobile) {
  new Notice(`[ChatGPT MD] ${message}`);
} else {
  this.updateStatusBar(message);
}
```

## Modal Usage Patterns

### SuggestModal Pattern

1. Extend `SuggestModal<T>`
2. Implement `getSuggestions(query)` - Return filtered items
3. Implement `renderSuggestion(item, el)` - Render item in list
4. Implement `onChooseSuggestion(item, evt)` - Handle selection

### Standard Modal Pattern

1. Extend `Modal`
2. Implement `onOpen()` - Build UI
3. Implement `onClose()` - Cleanup
4. Use `this.contentEl` for content

## Obsidian API Integration

### Editor Manipulation

- `editor.getCursor()` - Current cursor position
- `editor.setCursor(pos)` - Move cursor
- `editor.replaceRange(text, from, to)` - Insert/replace text
- `editor.getValue()` - Get all content
- `editor.lastLine()` - Last line number

### File Operations

- `app.vault.read(file)` - Read file
- `app.vault.modify(file, content)` - Update file
- `app.vault.create(path, content)` - Create file
- `app.vault.rename(file, newPath)` - Rename file

### Metadata Cache

- `app.metadataCache.getFileCache(file)` - Get frontmatter
- Updates automatically when files change
