# Message Flow

Complete flow from user input to AI response - a cross-cutting concern that touches all layers.

## Main Chat Flow

### 1. User Invokes "Chat" Command

User presses hotkey or selects command from palette.

### 2. CommandRegistry.registerChatCommand() Triggered

**Location**: `src/core/CommandRegistry.ts`

Command handler executes:
- Gets `EditorService` from `ServiceLocator`
- Retrieves settings from `SettingsService`
- Parses frontmatter from current note

### 3. EditorService.getMessagesFromEditor() Extracts Messages

**Location**: `src/Services/EditorService.ts`

EditorService orchestrates extraction:
- Reads editor content
- Passes to MessageService for processing

### 4. MessageService Parses Content

**Location**: `src/Services/MessageService.ts`

MessageService performs:
- **Split messages** - By `<hr class="__chatgpt_plugin">` separator
- **Extract roles** - Parse `role::assistant` or `role::user`
- **Find links** - Detect `[[Wiki Links]]` and `[Markdown](links)`
- **Remove comments** - Filter `=begin-chatgpt-md-comment` blocks
- **Remove frontmatter** - Strip YAML section

### 5. Linked Notes Fetched

**Location**: `src/Services/FileService.ts`

For each link found:
- FileService retrieves linked note content
- Content added to message context
- Prevents circular references

### 6. Frontmatter Merged with Global Settings

**Location**: `src/Services/FrontmatterService.ts`

FrontmatterService:
- Takes note frontmatter (YAML)
- Merges with global plugin settings
- Per-note settings override globals
- Determines AI service from `model` field

### 7. AI Service Retrieved

**Location**: `src/core/ServiceLocator.ts`

ServiceLocator:
- Parses model prefix (`ollama@`, `openrouter@`, etc.) or defaults to OpenAI
- Returns appropriate service via `getAiApiService(serviceType)`

### 8. Service Calls API

**Location**: `src/Services/*Service.ts`

Selected AI service:
- Constructs API request with messages
- Applies frontmatter configuration (temperature, max_tokens, etc.)
- Gets API key from ApiAuthService
- Uses ApiService to make HTTP request
- Handles streaming vs non-streaming

### 9. Response Streamed Back to Editor

**Location**: `src/Services/EditorService.ts`

EditorService.processResponse():
- Receives streaming chunks or complete response
- Inserts content at cursor or end of file (based on `generateAtCursor` setting)
- Formats with heading prefix
- Adds model name to response heading
- Updates editor in real-time during streaming

### 10. Optional Title Inference

**Location**: `src/Services/*Service.ts` (inferTitle method)

If configured (`autoInferTitle: true`) and conditions met:
- Note title is timestamp format
- More than 4 messages exchanged
- Service calls title inference
- Renames note file with inferred title

## Message Format

### In Editor

```markdown
---
model: gpt-5-mini
temperature: 0.7
---

# role::user

What is the capital of France?

<hr class="__chatgpt_plugin">

# role::assistant [gpt-5-mini]

The capital of France is Paris.
```

### Sent to API (OpenAI format)

```json
[
  {
    "role": "system",
    "content": "You are a helpful assistant. You're chatting with a user in Obsidian..."
  },
  {
    "role": "user",
    "content": "What is the capital of France?"
  }
]
```

### Different Service Formats

**Anthropic**:
```json
{
  "system": "You are a helpful assistant...",
  "messages": [
    {"role": "user", "content": "What is the capital of France?"}
  ]
}
```

**Gemini**:
```json
{
  "contents": [
    {"role": "user", "parts": [{"text": "What is the capital of France?"}]}
  ],
  "systemInstruction": {
    "parts": [{"text": "You are a helpful assistant..."}]
  }
}
```

## Streaming Flow

### Desktop (Node.js)

**Location**: `src/Services/requestStream.ts` + `src/Services/ApiService.ts`

1. `ApiService.streamSSE()` called
2. Uses `requestStream()` (Node.js http/https modules)
3. Bypasses CORS restrictions
4. Returns Web Streams API compatible response
5. SSE chunks parsed by ApiResponseParser
6. Chunks passed to callback
7. EditorService updates editor in real-time

### Mobile (Web API)

1. `ApiService.streamSSE()` called
2. Falls back to `fetch()` API
3. Subject to browser CORS policies
4. Rest of flow identical to desktop

## Error Handling Flow

At each stage:
- **ErrorService** processes errors
- **NotificationService** shows user messages
- Platform-specific notifications (Notice vs status bar)
- Errors don't crash plugin, gracefully handled

**Common error points**:
1. Network failure → `CHAT_ERROR_MESSAGE_NO_CONNECTION`
2. 401 Unauthorized → `CHAT_ERROR_MESSAGE_401`
3. 404 Not Found → `CHAT_ERROR_MESSAGE_404`
4. Truncation → `TRUNCATION_ERROR_INDICATOR`

## Link Context Injection

**Location**: `src/Services/MessageService.ts` → `src/Services/FileService.ts`

When note contains `[[Linked Note]]`:

1. MessageService finds link via regex
2. FileService retrieves "Linked Note" content
3. Content added to user message:
   ```
   Original message

   ---
   Context from [[Linked Note]]:
   [Note content here]
   ```
4. Sent to AI for richer context

**Prevents**:
- Circular references (tracks already-included notes)
- Including http:// URLs (external links ignored)

## Title Inference Flow

**Location**: AI service `inferTitle()` method

When triggered:

1. Check conditions:
   - Auto-inference enabled
   - Note has timestamp name format
   - More than 4 messages in conversation

2. Service constructs title inference prompt:
   ```
   Based on this conversation, suggest a concise title in [language]:
   [Conversation history]
   ```

3. Calls AI with title inference parameters:
   - Lower temperature (0.3)
   - Lower max_tokens (50)
   - Same model as chat

4. Receives suggested title

5. EditorService renames note file:
   - Validates title (no special chars)
   - Updates file path
   - Maintains internal references

## Service-Specific Response Parsing

**Location**: `src/Services/ApiResponseParser.ts`

Different APIs return different formats:

**OpenAI/OpenRouter**:
```json
{
  "choices": [{
    "delta": {"content": "text chunk"}
  }]
}
```

**Ollama**:
```json
{
  "message": {"content": "text chunk"}
}
```

**Anthropic**:
```json
{
  "type": "content_block_delta",
  "delta": {"text": "text chunk"}
}
```

**Gemini**:
```json
{
  "candidates": [{
    "content": {
      "parts": [{"text": "text chunk"}]
    }
  }]
}
```

ApiResponseParser handles all formats and returns unified content.

## Data Flow Diagram

```
User Command
    ↓
CommandRegistry
    ↓
EditorService ←→ MessageService ←→ FileService
    ↓                                    ↓
FrontmatterService              (Linked Notes)
    ↓
ServiceLocator
    ↓
AI Service (OpenAI/Ollama/etc)
    ↓
ApiService ←→ ApiAuthService
    ↓
requestStream (Desktop) / fetch (Mobile)
    ↓
API Response (Streaming SSE)
    ↓
ApiResponseParser
    ↓
EditorService (Insert Response)
    ↓
Editor Updated
    ↓
Optional: Title Inference
```

## Performance Considerations

**Parallel Operations**:
- Model fetching happens in background on plugin load
- Multiple models fetched in parallel (6s timeout each)

**Streaming Benefits**:
- Real-time response display (better UX)
- Partial content shown immediately
- Can be aborted mid-stream

**Token Efficiency**:
- Link context only included when needed
- Comment blocks excluded from API calls
- Frontmatter stripped before sending
