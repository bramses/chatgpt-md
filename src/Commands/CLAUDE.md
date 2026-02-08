# Commands

Obsidian command handlers extracted from the old `CommandRegistry.ts`. All commands receive dependencies via `ServiceContainer` in their constructors.

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

1. Get messages from editor via EditorService (splits by `<hr class="__chatgpt_plugin">`)
2. Parse frontmatter for model/settings (merge with global settings)
3. Get appropriate AI adapter from AiProviderService (based on model prefix)
4. Call AI API with messages + config via Vercel AI SDK
5. Stream response to editor via StreamingHandler
6. Optional auto title inference after 4+ messages

Uses `ServiceContainer` for dependency injection.

### ModelSelectHandler.ts

**Model selection modal**

- Opens AiModelSuggestModal (shows cached models immediately, fetches fresh in background)
- Fetches models from all configured providers
- Updates note frontmatter when selected

### InferTitleHandler.ts

**Generate title from conversation**

- Calls AI to suggest title based on messages
- Renames note file with inferred title
- Validates title (no special characters)
- Can auto-run after 4+ messages if enabled in settings

### StopStreamingHandler.ts

**Abort in-progress streaming**

- Calls abort controller to stop streaming
- Desktop only (mobile doesn't support Node.js streams)

## Utility Handlers

### SimpleHandlers.ts

Simple one-liner commands:

- **AddDividerHandler** - Inserts `<hr class="__chatgpt_plugin">` (message separator)
- **AddCommentBlockHandler** - Inserts comment block markers (`%%` ... `%%`)
- **ClearChatHandler** - Removes messages, keeps frontmatter

### RemainingHandlers.ts

Additional commands:

- **NewChatWithHighlightedTextHandler** - Create chat from selection
- **ChooseChatTemplateHandler** - Create chat from template
- **MoveToNewChatHandler** - Move conversation to new file

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

## Adding a New Command

1. Create handler class implementing appropriate interface (EditorCommandHandler, CallbackCommandHandler, etc.)
2. Add `getCommand()` returning `{ id, name, icon }`
3. Add `execute()` method with command logic
4. Inject dependencies via constructor (from ServiceContainer)
5. Register in `main.ts` using CommandRegistrar
