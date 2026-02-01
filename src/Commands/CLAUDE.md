# Commands

Obsidian command handlers extracted from the old `CommandRegistry.ts`.

## Architecture

Commands follow a handler pattern with interfaces defined in `CommandHandler.ts`:

```typescript
interface CommandHandler {
  getCommand(): CommandMetadata; // { id, name, icon }
}

interface EditorCommandHandler extends CommandHandler {
  execute(editor: Editor): void | Promise<void>;
}

interface EditorViewCommandHandler extends CommandHandler {
  execute(editor: Editor, view: MarkdownView): void | Promise<void>;
}

interface CallbackCommandHandler extends CommandHandler {
  execute(): void | Promise<void>;
}
```

## CommandRegistrar.ts

**Utility for simplifying command registration**

Reduces boilerplate in `main.ts`:

```typescript
const registrar = new CommandRegistrar(plugin);
registrar.registerEditorCommand(chatHandler);
registrar.registerEditorViewCommand(inferTitleHandler);
registrar.registerCallbackCommand(stopStreamingHandler);
```

## Main Handlers

### ChatHandler.ts

**Main chat command** - The primary command users invoke.

Flow:

1. Get messages from editor via EditorService
2. Parse frontmatter for model/settings
3. Get appropriate AI service from AiProviderService
4. Call AI API with messages + config
5. Stream response to editor
6. Optional auto title inference

Uses `ServiceContainer` for dependency injection.

### ModelSelectHandler.ts

**Model selection modal**

- Opens model selection modal
- Fetches fresh models from all configured providers
- Updates note frontmatter when selected

### InferTitleHandler.ts

**Generate title from conversation**

- Calls AI to suggest title based on messages
- Renames note file with inferred title
- Validates title (no special characters)

### StopStreamingHandler.ts

**Abort in-progress streaming**

- Calls `aiService.stopStreaming()`
- Desktop only (uses abort controller)

## Utility Handlers

### SimpleHandlers.ts

Simple one-liner commands:

- **AddDividerHandler** - Inserts `<hr class="__chatgpt_plugin">`
- **AddCommentBlockHandler** - Inserts comment block markers
- **ClearChatHandler** - Removes messages, keeps frontmatter

### RemainingHandlers.ts

Additional commands:

- **NewChatWithHighlightedTextHandler** - Create chat from selection
- **ChooseChatTemplateHandler** - Create chat from template

## CommandUtilities.ts

**Shared utilities for command handlers**

- `getAiApiUrls(frontmatter)` - Get service URLs from merged frontmatter
- Status bar helpers

## StatusBarManager

Reusable status bar management:

```typescript
class StatusBarManager {
  setText(text: string): void;
  clear(): void;
}
```
