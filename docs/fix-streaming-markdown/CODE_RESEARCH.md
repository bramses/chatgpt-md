# Code Research: Streaming Markdown Rendering Issues

## Executive Summary

When the ChatGPT MD plugin streams responses from LLMs into Obsidian's editor, incomplete markdown structures (tables, code fences, block quotes) cause visual rendering artifacts in Obsidian's Live Preview mode. This document provides a thorough analysis of the streaming pipeline, the root causes of rendering breakage, and how the current architecture operates.

---

## 1. Complete Streaming Pipeline

### 1.1 High-Level Flow

```
User triggers "Chat" command
    |
    v
ChatHandler.execute()                          [src/Commands/ChatHandler.ts]
    |
    v
EditorService.getMessagesFromEditor()          [src/Services/EditorService.ts]
    |-- MessageService.splitMessages()         (splits by <hr class="__chatgpt_plugin">)
    |-- MessageService.extractRoleAndMessage() (parses role::user / role::assistant)
    |-- resolves [[wiki links]] via FileService
    |
    v
AiProviderService.callAiAPI()                  [src/Services/AiProviderService.ts]
    |-- callStreamingAPI()
    |   |-- ensureProvider() (creates Vercel AI SDK provider instance)
    |   |-- setupStreamingContext() (inserts assistant header, creates StreamingHandler)
    |   |-- buildStreamRequest() (configures streamText parameters)
    |   |-- streamText(request) (Vercel AI SDK call)
    |   |-- consumeStream() (iterates textStream, appends to handler buffer)
    |   +-- handler.stopBuffering() (flushes final buffer)
    |
    v
StreamingHandler                                [src/Services/StreamingHandler.ts]
    |-- appendText(textPart)     -> accumulates into bufferedText
    |-- flush() every 50ms       -> calls flushBufferedText()
    |-- stopBuffering()          -> final flush + clear timer
    |
    v
flushBufferedText()                             [src/Utilities/StreamingHelpers.ts]
    |-- editor.replaceRange(bufferedText, currentCursor)
    |-- updates cursor position via posToOffset/offsetToPos
    |-- editor.setCursor(newCursor)
    |
    v
MessageService.processResponse()                [src/Services/MessageService.ts]
    |-- processStreamingResponse()
    |-- inserts user header ("\n\n<hr>\n\n### role::user\n\n")
```

### 1.2 Detailed Component Analysis

#### StreamingHandler (src/Services/StreamingHandler.ts)

The `StreamingHandler` is a buffering layer between the AI stream and the Obsidian editor:

- **Constructor**: Takes an `Editor`, initial cursor position, `setAtCursor` flag, and flush interval (default: 50ms)
- **startBuffering()**: Starts a `setInterval` timer that calls `flush()` every 50ms
- **appendText(text)**: Concatenates incoming text to `this.bufferedText`
- **flush()**: If buffer is non-empty, calls `flushBufferedText()` utility and resets buffer to `""`
- **stopBuffering()**: Clears the interval timer, then calls a final `flush()`

**Key observation**: The buffer has NO awareness of markdown structure. It accumulates raw text for 50ms, then dumps whatever has accumulated to the editor. A code fence opening (` ``` `) might be flushed without its closing counterpart, leaving an unclosed block in the editor.

#### flushBufferedText (src/Utilities/StreamingHelpers.ts)

```typescript
export function flushBufferedText(
  editor: Editor,
  bufferedText: string,
  currentCursor: EditorPosition,
  setAtCursor: boolean
): EditorPosition {
  if (setAtCursor) {
    editor.replaceSelection(bufferedText);
  } else {
    editor.replaceRange(bufferedText, currentCursor);
    const currentOffset = editor.posToOffset(currentCursor);
    const newOffset = currentOffset + bufferedText.length;
    const newCursor = editor.offsetToPos(newOffset);
    editor.setCursor(newCursor);
    return newCursor;
  }
  return currentCursor;
}
```

This function performs a direct, synchronous insertion into the Obsidian editor at the tracked cursor position. There is:
- No markdown validation
- No structure-awareness
- No buffering of incomplete blocks
- Each call triggers Obsidian's live preview re-render of the affected content

#### AiProviderService.consumeStream() (src/Services/AiProviderService.ts)

```typescript
private async consumeStream(streamResult: any, handler: StreamingHandler): Promise<string> {
  let text = "";
  const { textStream } = streamResult;

  for await (const textPart of textStream) {
    if (this.apiService.wasAborted()) {
      break;
    }
    text += textPart;
    handler.appendText(textPart);
  }

  handler.stopBuffering();
  return text;
}
```

This iterates over the Vercel AI SDK's `textStream` (an `AsyncIterableStream<string>`). Each `textPart` is a text delta -- typically a few tokens worth of text. These deltas are immediately appended to the `StreamingHandler` buffer.

**Key observation**: The text deltas arrive token-by-token from the LLM. A markdown table might arrive as:
1. `| Header 1 |`
2. ` Header 2 |\n`
3. `|---|---|\n`
4. `| Cell 1 |`
5. ` Cell 2 |`

Between each flush (every 50ms), only partial table rows may have arrived, causing Obsidian's Live Preview to render broken table HTML.

#### insertAssistantHeader (src/Utilities/ResponseHelpers.ts)

Before streaming begins, this function inserts the assistant role header:
```
\n\n<hr class="__chatgpt_plugin">\n\n### role::assistant<span style="font-size: small;"> (model-name)</span>\n\n
```

The streaming content is then appended after this header.

---

## 2. Editor Rendering Behavior

### 2.1 Obsidian's Live Preview Mode

Obsidian uses CodeMirror 6 as its editor with a custom markdown rendering pipeline ("Live Preview"). In this mode:

- **Source text is the ground truth** -- the editor stores raw markdown
- **Decorations are computed on-the-fly** -- CodeMirror plugins analyze the markdown AST and overlay rendered decorations (tables, code blocks, headings, etc.)
- **Rendering is triggered on every document change** -- each `editor.replaceRange()` call triggers a CodeMirror transaction, which re-parses the affected region and updates decorations

### 2.2 How Incomplete Markdown Breaks Rendering

When `flushBufferedText()` inserts partial markdown into the editor, the following happens:

1. **Code Fences (` ``` `)**:
   - Opening fence arrives: ` ```python\n `
   - Live Preview enters "code block" mode, rendering everything after as code
   - Without the closing fence, ALL subsequent text (including user's own content below) gets swallowed into the code block
   - When closing fence finally arrives, there's a visual "jump" as the block closes

2. **Tables**:
   - A partial table row like `| Col 1 | Col 2` without `|\n` is not recognized as a table
   - The separator row `|---|---|` arriving without the header row above creates parsing confusion
   - Table rendering toggles on/off as rows arrive, causing flickering
   - Partial rows may render as plain text with pipe characters

3. **Block Quotes**:
   - `> ` prefix without content, or multi-line quotes arriving one line at a time
   - Less severe than tables/code blocks but still causes visual reflow

4. **HTML blocks** (like `<details>`, `<summary>`):
   - Opening tags without closing tags can cause rendering to consume subsequent content
   - Similar issue to code fences

5. **Nested structures**:
   - Lists with code blocks inside
   - Tables inside block quotes
   - These compound the rendering issues

### 2.3 Flush Timing Analysis

The current flush interval is 50ms (`DEFAULT_FLUSH_INTERVAL_MS`). At typical LLM streaming speeds:

- **Fast models** (GPT-4o, Claude 3.5 Sonnet): ~80-120 tokens/second = ~4-6 tokens per flush
- **Slower models** (local Ollama): ~10-30 tokens/second = ~0.5-1.5 tokens per flush
- **Very fast models** (Gemini Flash): ~150+ tokens/second = ~7-10+ tokens per flush

With 4-6 tokens per flush, a table header row (`| Header 1 | Header 2 | Header 3 |`) is approximately 10-15 tokens, meaning it would take 2-3 flushes to complete a single row. During each partial flush, the table structure is broken.

---

## 3. Vercel AI SDK Streaming APIs

### 3.1 Current Usage (AI SDK v6.0.77)

The plugin uses `streamText()` from the `ai` package (version 6.0.77):

```typescript
import { streamText } from "ai";

const result = streamText({
  model,
  messages: aiSdkMessages,
  abortSignal,
  // Optional: tools
});

const { textStream } = result;
for await (const textPart of textStream) {
  handler.appendText(textPart);
}
```

### 3.2 Available Streaming Features (Not Currently Used)

**`experimental_transform`** option:
The AI SDK provides a `smoothStream` utility and custom transform support:

```typescript
import { smoothStream, streamText } from 'ai';

const result = streamText({
  model,
  messages,
  experimental_transform: smoothStream({
    delayInMs: 20,
    chunking: 'line',  // Can be 'word', 'line', RegExp, or custom callback
  }),
});
```

The `chunking: 'line'` option would buffer text until a complete line is available, which partially addresses table rendering (since table rows end with `|\n`). However, it does NOT solve multi-line structures like code fences.

**Custom chunking callback**:
A custom callback could be provided to detect and buffer incomplete markdown blocks:

```typescript
smoothStream({
  chunking: (buffer: string) => {
    // Custom logic to detect complete markdown structures
    // Return text to emit, or null to keep buffering
  },
});
```

**`fullStream`** (vs `textStream`):
The `fullStream` provides typed events including `text`, `tool-call`, `start-step`, `finish-step`, etc. This gives more granular control but doesn't directly solve the markdown issue.

**`onChunk` callback**:
Called for each chunk of the stream. Could be used to implement custom buffering logic.

---

## 4. Files Involved in the Streaming Pipeline

| File | Role | Lines of Interest |
|------|------|------------------|
| `src/Commands/ChatHandler.ts` | Entry point, invokes AI call | Lines 81-91 |
| `src/Services/AiProviderService.ts` | Core streaming orchestration | Lines 514-573 (callAiSdkStreamText), 651-665 (consumeStream) |
| `src/Services/StreamingHandler.ts` | Buffer management, flush timer | Entire file (107 lines) |
| `src/Utilities/StreamingHelpers.ts` | Editor insertion utilities | Lines 12-35 (flushBufferedText), line 6 (DEFAULT_FLUSH_INTERVAL_MS = 50) |
| `src/Utilities/ResponseHelpers.ts` | Assistant header insertion | Lines 24-44 (insertAssistantHeader) |
| `src/Services/MessageService.ts` | Post-stream processing | Lines 183-198 (processStreamingResponse) |
| `src/Services/ApiService.ts` | Fetch adapter, abort control | Lines 137-165 |
| `src/Services/requestStream.ts` | Node.js/fetch streaming transport | Entire file (215 lines) |
| `styles.css` | Plugin CSS styles | Current styles (no streaming-related CSS) |

---

## 5. Key Findings

### 5.1 Root Cause
The streaming pipeline has **zero markdown-awareness**. The `StreamingHandler` is a pure time-based buffer (50ms flushes) that blindly inserts whatever text has accumulated. It has no concept of markdown block structures, and each flush triggers Obsidian's Live Preview re-rendering on potentially broken markdown.

### 5.2 Existing Mitigation
The 50ms buffering interval provides some batching, but it is insufficient. It was designed for smooth text insertion performance, not markdown correctness.

### 5.3 Architecture Characteristics
- The `StreamingHandler` is cleanly separated from the AI provider logic -- modifications can be isolated
- The `flushBufferedText` utility is the single point of editor insertion -- easy to intercept
- The Vercel AI SDK's `experimental_transform` option provides a built-in hook for stream transformation
- The architecture supports both `setAtCursor` and end-of-document modes -- any solution must handle both

### 5.4 Constraints
- Obsidian's Editor API provides `replaceRange` and `replaceSelection` but no direct control over Live Preview rendering
- There is no public API to temporarily disable Live Preview re-rendering
- CodeMirror 6 extensions could theoretically be used but would be complex and tightly coupled to Obsidian internals
- The plugin must work on both desktop (Node.js streams) and mobile (fetch API)
