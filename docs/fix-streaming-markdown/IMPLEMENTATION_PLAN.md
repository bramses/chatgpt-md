# Implementation Plan: Fix Streaming Markdown Rendering

## Problem Statement

When AI responses are streamed into Obsidian's editor, incomplete markdown structures (code fences, tables, block quotes, HTML blocks) cause visual rendering artifacts in Live Preview mode. The current `StreamingHandler` performs time-based buffering (50ms intervals) with no awareness of markdown structure, leading to broken tables, unclosed code blocks, and visual flickering during streaming.

---

## Root Cause Analysis

### Primary Cause
The `StreamingHandler.flush()` method fires every 50ms and inserts whatever accumulated text exists into the editor. At typical LLM streaming speeds (80-150 tokens/second), multi-line structures like tables (10-15+ tokens per row) or code fences span multiple flush cycles. Each partial flush produces syntactically invalid markdown that Obsidian's Live Preview attempts to render, resulting in broken layouts.

### Contributing Factors
1. **No markdown parsing in the streaming path** -- The buffer is a plain string concatenation
2. **Each editor insertion triggers re-rendering** -- Obsidian/CodeMirror 6 re-parses and re-renders decorations on every `replaceRange()` call
3. **LLM token boundaries don't align with markdown boundaries** -- Tokens are subword units that frequently split markdown syntax markers
4. **50ms flush interval is too aggressive for complex structures** -- A full table row may take 100-200ms to arrive

---

## Solution Approaches

### Solution A: Markdown-Aware Buffering in StreamingHandler

**Concept**: Modify the `StreamingHandler` to detect incomplete markdown blocks and withhold them from the editor until they are structurally complete. Text outside of block structures is flushed immediately as before.

#### How It Works
1. Before each flush, analyze the buffered text for incomplete markdown structures:
   - **Code fences**: Count opening ` ``` ` markers without matching closing markers
   - **Tables**: Detect if the buffer ends mid-row (no trailing `|\n`) or lacks the separator row
   - **HTML blocks**: Track unclosed `<tag>` without `</tag>`
2. Split the buffer into "safe to flush" (complete structures + plain text) and "hold back" (incomplete structures)
3. Flush only the safe portion; retain the incomplete portion for the next flush cycle
4. On stream completion (`stopBuffering()`), flush everything regardless of completeness

#### Implementation Details

**New file**: `src/Utilities/MarkdownBlockDetector.ts`
```
Functions:
- findSafeFlushPoint(buffer: string): number
  Returns the index up to which the buffer can be safely flushed.
  Scans for unclosed code fences, incomplete table rows, unclosed HTML tags.

- isInsideCodeFence(text: string): boolean
  Counts opening/closing ``` markers (handling ~~~, indented blocks).

- isInsideTable(text: string): boolean
  Detects if text ends with an incomplete table structure.

- isInsideHtmlBlock(text: string): boolean
  Tracks unclosed HTML block-level tags.
```

**Modified file**: `src/Services/StreamingHandler.ts`
```
Changes to flush():
- Before flushing, call findSafeFlushPoint(this.bufferedText)
- Flush only text up to the safe point
- Retain the rest in the buffer
- On stopBuffering(), skip the safe point check (flush all)
```

**Modified file**: `src/Utilities/StreamingHelpers.ts`
```
No changes needed -- flushBufferedText remains the low-level editor insertion.
```

#### Pros
- Directly addresses the root cause at the correct layer
- No external dependencies
- Works with all AI providers (provider-agnostic)
- Preserves existing streaming architecture
- Testable with pure unit tests (MarkdownBlockDetector is a pure function)
- Minimal performance overhead (simple string scanning)
- Graceful degradation: worst case is slightly delayed display of block content

#### Cons
- Markdown parsing in a streaming context is inherently imperfect (edge cases with nested structures, unusual markdown extensions)
- Adds latency for block content (code blocks, tables wait until complete before displaying)
- Must be maintained as new markdown features are supported
- Complex nested structures (code block inside a table, or table inside a blockquote) are harder to detect correctly
- Buffer could grow large for very long code blocks, increasing memory until the block closes

#### Complexity: Medium
- ~150-200 lines of new code for `MarkdownBlockDetector.ts`
- ~20-30 lines of changes to `StreamingHandler.ts`
- Comprehensive test suite needed for edge cases

#### Risk: Low-Medium
- Core editor insertion path is unchanged
- Worst case: some content displays slightly later
- Buffer size concern is mitigated by stream completion flush

#### Performance Impact: Negligible
- String scanning of the buffer (typically <1KB) is sub-millisecond
- Flush frequency remains the same; only the content per flush changes

---

### Solution B: Vercel AI SDK `experimental_transform` with Custom Chunking

**Concept**: Use the Vercel AI SDK's built-in `experimental_transform` option with a custom chunking function to ensure text deltas are emitted at markdown-safe boundaries before they reach the `StreamingHandler`.

#### How It Works
1. Pass `experimental_transform: smoothStream({ chunking: customMarkdownChunker })` to the `streamText()` call
2. The custom chunker buffers incoming text and only emits chunks when markdown blocks are complete
3. The `StreamingHandler` receives pre-cleaned chunks and can flush them safely

#### Implementation Details

**Modified file**: `src/Services/AiProviderService.ts`
```
Changes to buildStreamRequest():
- Import smoothStream from 'ai'
- Add experimental_transform option with custom chunking callback

Changes to streamContinuation():
- Same transform applied to continuation streams
```

**New file**: `src/Utilities/MarkdownChunker.ts`
```
Functions:
- createMarkdownChunker(): (buffer: string) => string | null | undefined
  Returns a chunking callback compatible with smoothStream.
  Buffers text until markdown-safe boundaries.
  Returns the safe portion or null to keep buffering.
```

#### Pros
- Uses a supported (though experimental) AI SDK feature -- less custom code
- Transform happens BEFORE text reaches the StreamingHandler, cleaner separation
- Built-in delay handling via `smoothStream`
- The SDK handles the stream plumbing; we only provide the chunking logic

#### Cons
- **`experimental_transform` is an experimental API** -- may change or be removed in future AI SDK versions
- Chunking callback has limited API surface (receives buffer string, returns string or null)
- Applied at the AI SDK level, so it affects ALL text processing (including non-markdown responses)
- Harder to unit test in isolation (requires mocking AI SDK streaming infrastructure)
- The `smoothStream` utility adds its own delay (`delayInMs`), which compounds with the `StreamingHandler`'s 50ms flush interval -- potentially making streaming feel sluggish
- Only works for the `streamText` path -- tool continuation streams in `streamContinuation()` need separate handling
- Tight coupling to AI SDK version

#### Complexity: Medium
- ~80-120 lines for the custom chunker
- ~15-20 lines of changes to `AiProviderService.ts`
- Need to apply to both initial stream and continuation streams

#### Risk: Medium
- Dependency on experimental API
- AI SDK upgrade could break the feature
- Interaction between `smoothStream` delay and `StreamingHandler` flush interval needs tuning

#### Performance Impact: Low
- `smoothStream` adds a small configurable delay
- Custom chunking callback is called per-chunk (lightweight string analysis)

---

### Solution C: Post-Flush Correction via Invisible Placeholder Closing Tags

**Concept**: Instead of withholding incomplete markdown, insert temporary "closing" markers (phantom closing fences, table endings) after each flush so that Obsidian renders complete structures. When the real content arrives, remove the placeholders and insert the actual content.

#### How It Works
1. After each `flushBufferedText()` call, analyze the total document content (or tracked state) for unclosed blocks
2. If an unclosed code fence is detected, append a temporary closing ` ``` ` marker with a special hidden comment
3. If an unclosed table row is detected, append a temporary `|` and newline
4. When new text arrives, first remove any existing placeholders, then insert the real text + new placeholders if still incomplete

#### Implementation Details

**New file**: `src/Utilities/MarkdownPlaceholders.ts`
```
Functions:
- generatePlaceholders(flushedContent: string, existingDoc: string): string
  Analyzes the current state and returns placeholder closing markers.

- removePlaceholders(editor: Editor, cursor: EditorPosition): EditorPosition
  Removes previously inserted placeholders, returns adjusted cursor.
```

**Modified files**:
- `src/Services/StreamingHandler.ts` -- track whether placeholders are active
- `src/Utilities/StreamingHelpers.ts` -- insert/remove placeholders around flush operations

#### Pros
- Content displays immediately (no buffering delay)
- Users see structurally valid markdown at all times
- Tables render as tables, code blocks render as code blocks, even mid-stream

#### Cons
- **High complexity**: Inserting and removing phantom content in the editor creates a moving-parts problem
- **Cursor management nightmare**: Removing placeholders shifts document offsets, requiring careful recalculation
- **Race conditions**: If a flush arrives while placeholders are being removed, cursor positions can desync
- **Performance overhead**: Each flush requires analyzing document state, inserting placeholders, and then removing them on next flush
- **Undo history pollution**: Each placeholder insert/remove creates undo entries, making Ctrl+Z unpredictable
- **Visual flicker**: Even with fast placeholder management, there may be a brief flash as placeholders are removed and real content inserted
- **Edge cases**: Nested blocks, overlapping structures, and user editing during streaming all create complex scenarios
- **Code block content corruption**: If the LLM is outputting code that happens to contain ` ``` `, the placeholder system could misidentify it

#### Complexity: High
- ~200-300 lines of new code
- Significant changes to StreamingHandler and StreamingHelpers
- Complex state management for placeholder tracking

#### Risk: High
- Cursor desync bugs are difficult to diagnose and reproduce
- Undo history corruption frustrates users
- Interaction with Obsidian's internal state management is unpredictable

#### Performance Impact: Medium
- Additional editor operations per flush (read document state, insert, remove)
- More CodeMirror transactions per flush cycle

---

### Solution D: CSS-Based Hiding of Incomplete Blocks (Visual-Only Fix)

**Concept**: Use CSS to hide the visual rendering artifacts of incomplete markdown blocks during streaming. After streaming completes, remove the CSS class so the final content renders correctly.

#### How It Works
1. Before streaming starts, add a CSS class to the editor container (e.g., `chatgpt-md-streaming`)
2. This class applies CSS rules that suppress broken rendering:
   - Hide partially rendered tables
   - Prevent code fence "spillover" with overflow containment
   - Reduce visual flickering with transition smoothing
3. After streaming ends, remove the CSS class

#### Implementation Details

**Modified file**: `styles.css`
```css
/* During streaming, prevent visual artifacts */
.chatgpt-md-streaming .cm-line:has(> .cm-hmd-table-sep) {
  /* Stabilize table rendering */
}

.chatgpt-md-streaming .cm-codeblock {
  /* Contain code block rendering */
}
```

**Modified files**:
- `src/Services/AiProviderService.ts` -- add/remove CSS class on editor container before/after streaming
- `src/Services/StreamingHandler.ts` -- potentially track streaming state for CSS class management

#### Pros
- Zero impact on the streaming pipeline itself
- No additional text processing or buffering
- Simple to implement (CSS + class toggle)
- No risk of cursor desync or buffer issues

#### Cons
- **Does not actually fix the problem** -- the markdown is still broken in the source, just visually hidden
- **CSS selectors for partial markdown are unreliable** -- Obsidian's CodeMirror rendering uses internal CSS classes that are not part of any public API and can change between Obsidian versions
- **Cannot hide all artifact types** -- code fence spillover, where all subsequent text becomes "code," cannot be fixed with CSS alone since the entire document structure changes
- **Source mode is unaffected** -- users in Source Mode would still see raw broken markdown
- **Limited control** -- CSS cannot distinguish between "streaming in progress" incomplete blocks and legitimately incomplete blocks the user wrote
- **Accessibility concerns** -- hiding content affects screen readers and assistive technology
- **Fragile across Obsidian versions** -- internal CodeMirror class names may change

#### Complexity: Low
- ~20-30 lines of CSS
- ~10-15 lines of JavaScript for class toggling

#### Risk: Medium-High
- False sense of fix -- underlying issue remains
- Fragile CSS selectors
- Version-dependent behavior

#### Performance Impact: Negligible
- CSS class toggle is instantaneous
- Minimal CSS rule overhead

---

### Solution E: Hybrid Approach -- Markdown-Aware Buffering + Line-Based Chunking

**Concept**: Combine Solution A's markdown-aware buffering with the AI SDK's `smoothStream` line-based chunking to create a two-layer defense. The SDK transform provides coarse-grained line-level buffering, while the `StreamingHandler` provides fine-grained markdown block awareness.

#### How It Works
1. **Layer 1 (AI SDK)**: Use `experimental_transform: smoothStream({ chunking: 'line' })` to ensure text deltas arrive as complete lines
2. **Layer 2 (StreamingHandler)**: Enhanced flush logic that additionally detects incomplete multi-line blocks (code fences, tables spanning multiple lines)
3. Lines of plain text and complete single-line markdown flow through immediately
4. Multi-line blocks are buffered until structurally complete

#### Implementation Details

**New file**: `src/Utilities/MarkdownBlockDetector.ts` (same as Solution A)

**Modified file**: `src/Services/AiProviderService.ts`
```
Add smoothStream({ chunking: 'line' }) to buildStreamRequest()
Apply to both initial and continuation streams
```

**Modified file**: `src/Services/StreamingHandler.ts`
```
Same changes as Solution A (markdown-aware flush)
```

#### Pros
- Two-layer defense reduces edge cases
- Line-based chunking from SDK handles the most common issues (table rows, single-line elements)
- Markdown block detection in StreamingHandler catches multi-line structures (code fences)
- Each layer is independently testable
- Graceful degradation: if one layer fails, the other still provides partial mitigation

#### Cons
- Two separate mechanisms to maintain
- Experimental AI SDK API dependency (same risk as Solution B)
- Potential double-buffering could add noticeable latency
- More complex mental model for developers
- Need to tune interaction between SDK delay and StreamingHandler flush interval

#### Complexity: Medium-High
- All code from Solution A + SDK integration from Solution B
- Need to ensure the two layers don't conflict

#### Risk: Medium
- AI SDK experimental API risk
- Dual-layer interaction complexity
- But each layer independently provides value

#### Performance Impact: Low
- Two lightweight string analyses per chunk
- `smoothStream` line buffering is fast

---

## Comparison Matrix

| Criterion | A: MD-Aware Buffer | B: SDK Transform | C: Placeholders | D: CSS Hide | E: Hybrid |
|-----------|:------------------:|:----------------:|:---------------:|:-----------:|:---------:|
| **Fixes root cause** | Yes | Yes | Yes | No | Yes |
| **Implementation complexity** | Medium | Medium | High | Low | Medium-High |
| **Risk level** | Low-Medium | Medium | High | Medium-High | Medium |
| **External dependencies** | None | AI SDK experimental API | None | Obsidian CSS internals | AI SDK experimental API |
| **Streaming latency impact** | Low (block content only) | Low (line buffering) | None | None | Low |
| **Testability** | Excellent | Moderate | Poor | N/A | Good |
| **Maintenance burden** | Low | Medium (API changes) | High | Medium (version breaks) | Medium |
| **Works across all providers** | Yes | Yes | Yes | Yes | Yes |
| **Works on mobile** | Yes | Yes | Yes | Yes | Yes |
| **Handles code fences** | Yes | Partially (line-level) | Yes | No | Yes |
| **Handles tables** | Yes | Yes (line = row) | Yes | Partially | Yes |
| **Handles HTML blocks** | Yes | Partially | Yes | No | Yes |
| **Undo history impact** | None | None | Severe | None | None |

---

## Recommendation

### Primary Recommendation: Solution A (Markdown-Aware Buffering)

**Justification**:

1. **Directly addresses the root cause** without external dependencies
2. **Lowest risk** -- changes are confined to the streaming buffer layer
3. **Excellent testability** -- `MarkdownBlockDetector` is a pure function with well-defined inputs/outputs
4. **No experimental API dependency** -- immune to AI SDK version changes
5. **Clean architecture** -- adds a single new utility module, modifies only the `StreamingHandler.flush()` method
6. **Graceful degradation** -- worst case is slightly delayed display of block content; stream completion always flushes everything

### Secondary Recommendation: Solution E (Hybrid) -- if Solution A proves insufficient

If edge cases arise where Solution A alone doesn't catch all rendering issues (e.g., very fast streaming where lines arrive fragmented), the SDK's line-based chunking can be added as a complementary first layer. This can be done incrementally without modifying Solution A's code.

### Not Recommended:
- **Solution C (Placeholders)**: Too complex, too many edge cases, undo history corruption
- **Solution D (CSS Hide)**: Does not fix the actual problem, fragile, incomplete coverage

---

## Implementation Phases (for recommended Solution A)

### Phase 1: Core Detection Logic
1. Create `src/Utilities/MarkdownBlockDetector.ts` with `findSafeFlushPoint()`
2. Handle the three primary block types: code fences, tables, HTML blocks
3. Write comprehensive unit tests

### Phase 2: StreamingHandler Integration
1. Modify `StreamingHandler.flush()` to use `findSafeFlushPoint()`
2. Add `forceFlush` parameter to `stopBuffering()` for stream completion
3. Add buffer size safety valve (force flush if buffer exceeds threshold, e.g., 10KB)

### Phase 3: Edge Case Handling
1. Nested structures (code blocks inside tables, tables inside blockquotes)
2. Obsidian-specific markdown extensions (callouts, wiki links, etc.)
3. Indented code blocks (4-space/tab indentation)
4. Very long code blocks (buffer size management)

### Phase 4: Testing and Tuning
1. Manual testing with various LLM providers and model speeds
2. Performance profiling of the block detection logic
3. Fine-tune buffer size safety valve threshold
4. Test on both desktop and mobile
