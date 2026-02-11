# Project Specification: Fix Streaming Markdown Rendering

## Overview

| Field | Value |
|-------|-------|
| **Issue** | fix-streaming-markdown |
| **Type** | Bug fix / UX improvement |
| **Priority** | High (affects every streaming response with structured content) |
| **Affected Components** | StreamingHandler, StreamingHelpers, AiProviderService |
| **Branch** | `fix-streaming-markdown` (from `agents`) |

## Problem Definition

### Current Behavior
When an LLM streams a response containing markdown block structures (code fences, tables, HTML blocks), the content is inserted into Obsidian's editor in 50ms flush intervals. Each partial insertion produces syntactically invalid markdown that Obsidian's Live Preview renders incorrectly, causing:

- **Code blocks**: Opening ` ``` ` without closing fence causes all subsequent text to render as code
- **Tables**: Partial rows render as plain text with pipe characters; structure flickers on/off
- **HTML blocks**: Unclosed tags consume subsequent content into the HTML element

### Expected Behavior
During streaming, markdown block structures should render correctly (or be held back until structurally complete). The final rendered result should be identical to what would appear if the entire response were inserted at once.

### Scope
- Streaming responses from all AI providers (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, LM Studio, Z.AI)
- Both desktop (Node.js) and mobile (fetch API) environments
- Both `generateAtCursor` and end-of-document insertion modes
- Tool continuation streams (after tool call results)

---

## Technical Specification

### Architecture Decision
**Solution A: Markdown-Aware Buffering** has been selected as the recommended approach. See `IMPLEMENTATION_PLAN.md` for full comparison of alternatives.

### New Module: MarkdownBlockDetector

**File**: `src/Utilities/MarkdownBlockDetector.ts`

**Purpose**: Analyze a text buffer and determine the safe flush point -- the index up to which the buffer contains structurally complete markdown.

#### Public API

```typescript
/**
 * Analyze buffered text and find the safe point to flush to the editor.
 * Returns the index up to which the buffer can be safely flushed.
 * Text after this index should be retained for the next flush cycle.
 *
 * @param buffer - The accumulated text buffer
 * @returns The index up to which it's safe to flush (0 = flush nothing, buffer.length = flush all)
 */
export function findSafeFlushPoint(buffer: string): number;
```

#### Detection Rules

**1. Code Fences**

A code fence is opened by a line starting with 3+ backticks (` ``` `) or tildes (`~~~`), optionally followed by a language identifier. It is closed by a matching line with the same or more fence characters.

Detection logic:
- Scan the buffer for lines starting with ` ``` ` or `~~~`
- Track the fence state (open/closed) using a simple counter
- If the buffer ends with an open fence, the safe flush point is the character before the opening fence line
- If the buffer has balanced fences, flush everything

Edge cases:
- Backticks inside inline code (`` ` ``) -- these do NOT start fences
- Indented code blocks (4+ spaces) -- not fence-based, handled differently
- Nested fences (` ```` ` inside ` ``` `) -- use fence character count for matching

**2. Tables**

A markdown table requires:
- Header row: `| col1 | col2 |`
- Separator row: `|---|---|`
- Data rows: `| data1 | data2 |`

Detection logic:
- If the buffer ends with text containing `|` but no trailing newline, it might be a partial table row
- If the buffer contains a header row but not yet a separator row, hold back the table
- Once separator row arrives, flush the complete header + separator
- Subsequent rows: flush when they end with `|\n`

Simplified approach: If the last non-empty line of the buffer starts with `|` and doesn't end with `|\n`, hold it back.

**3. HTML Blocks**

Block-level HTML elements (`<div>`, `<details>`, `<summary>`, `<table>`, `<pre>`, `<blockquote>`, etc.).

Detection logic:
- Track opening block-level tags without matching closing tags
- If the buffer ends inside an unclosed HTML block, the safe flush point is before the opening tag

**4. Buffer Size Safety Valve**

To prevent unbounded buffer growth (e.g., a very long code block):
- If the buffer exceeds `MAX_BUFFER_SIZE` (e.g., 10,000 characters), flush everything regardless
- This ensures the UI stays responsive even for extremely long blocks
- The user will see a momentary rendering artifact, but the buffer won't consume excessive memory

#### Internal Helpers

```typescript
/**
 * Check if text ends inside an unclosed code fence
 */
function isInsideCodeFence(text: string): { inside: boolean; fenceStartIndex: number };

/**
 * Check if text ends with an incomplete table row
 */
function isInsideIncompleteTableRow(text: string): { inside: boolean; rowStartIndex: number };

/**
 * Check if text ends inside an unclosed HTML block
 */
function isInsideHtmlBlock(text: string): { inside: boolean; blockStartIndex: number };
```

### Modified Module: StreamingHandler

**File**: `src/Services/StreamingHandler.ts`

#### Changes

1. **Import** `findSafeFlushPoint` from `MarkdownBlockDetector`

2. **Modify `flush()` method**:
```
Current:
  flush() -> if buffer not empty -> flushBufferedText(all buffer) -> clear buffer

New:
  flush() -> if buffer not empty -> findSafeFlushPoint(buffer)
          -> if safePoint > 0 -> flushBufferedText(buffer[0..safePoint]) -> retain buffer[safePoint..]
          -> if safePoint == 0 -> do nothing (keep buffering)
```

3. **Add `forceFlush` parameter to `stopBuffering()`**:
```typescript
public stopBuffering(): void {
  if (this.flushTimer) {
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }
  // Force flush everything when stream ends, regardless of block completeness
  this.forceFlush();
}

private forceFlush(): void {
  if (this.bufferedText.length === 0) return;
  this.currentCursor = flushBufferedText(
    this.editor, this.bufferedText, this.currentCursor, this.setAtCursor
  );
  this.bufferedText = "";
}
```

4. **Add buffer size safety valve**:
```typescript
private static readonly MAX_BUFFER_SIZE = 10000;

public flush(): void {
  if (this.bufferedText.length === 0) return;

  // Safety valve: flush everything if buffer is too large
  if (this.bufferedText.length > StreamingHandler.MAX_BUFFER_SIZE) {
    this.forceFlush();
    return;
  }

  const safePoint = findSafeFlushPoint(this.bufferedText);
  if (safePoint > 0) {
    const safeText = this.bufferedText.substring(0, safePoint);
    this.bufferedText = this.bufferedText.substring(safePoint);
    this.currentCursor = flushBufferedText(
      this.editor, safeText, this.currentCursor, this.setAtCursor
    );
  }
  // If safePoint === 0, keep buffering
}
```

### Unchanged Modules

These files require NO changes:
- `src/Utilities/StreamingHelpers.ts` -- `flushBufferedText()` remains the low-level insertion
- `src/Services/AiProviderService.ts` -- `consumeStream()` continues to call `handler.appendText()`
- `src/Services/ApiService.ts` -- fetch adapter unchanged
- `src/Services/requestStream.ts` -- transport layer unchanged
- `src/Services/MessageService.ts` -- post-stream processing unchanged

---

## Test Plan

### Unit Tests: MarkdownBlockDetector

**File**: `src/Utilities/MarkdownBlockDetector.test.ts`

#### Code Fence Tests
```
- Empty string returns buffer.length (flush all)
- Plain text without blocks returns buffer.length (flush all)
- Complete code fence (open + content + close) returns buffer.length
- Unclosed code fence returns index before opening fence
- Multiple complete code fences returns buffer.length
- Code fence with language identifier handled correctly
- Tilde fences (~~~) handled correctly
- Nested fences (4 backticks inside 3) handled correctly
- Inline backticks (not fences) do not trigger detection
- Code fence at start of buffer with no preceding text
- Code fence with trailing content after closing fence
```

#### Table Tests
```
- Complete table (header + separator + rows) returns buffer.length
- Header row without separator row holds back
- Partial row (no trailing newline) holds back
- Complete rows followed by partial row: safe point before partial row
- Single pipe character at end does not trigger detection
- Table with alignment markers (|:---|:---:|---:|)
- Empty table cells (||)
- Table followed by plain text returns buffer.length
```

#### HTML Block Tests
```
- Complete HTML block (<div>...</div>) returns buffer.length
- Unclosed <details> tag holds back
- Self-closing tags (<br />, <hr />) do not trigger detection
- Nested HTML blocks handled correctly
- HTML block with attributes handled correctly
```

#### Safety Valve Tests
```
- Buffer exceeding MAX_BUFFER_SIZE always returns buffer.length
- Buffer at exactly MAX_BUFFER_SIZE uses normal detection
```

#### Mixed Content Tests
```
- Plain text followed by unclosed code fence: safe point at fence start
- Complete code fence followed by partial table: safe point after fence
- Multiple block types in sequence
- Markdown with embedded HTML
```

### Integration Tests (Manual)

1. **Code block streaming**: Ask LLM for a long code example, verify no spillover during streaming
2. **Table streaming**: Ask LLM for a comparison table, verify rows render correctly
3. **Mixed content**: Ask LLM for a response with text + code + table + text
4. **Fast model**: Test with a fast model (GPT-4o, Gemini Flash) to stress the buffering
5. **Slow model**: Test with a slow model (local Ollama) to verify no unnecessary delays
6. **Abort mid-stream**: Stop streaming during a code block, verify clean state
7. **Mobile**: Verify on iOS/Android Obsidian
8. **generateAtCursor mode**: Verify cursor-based insertion works correctly
9. **Tool continuation**: Verify streaming after tool call works correctly

---

## Acceptance Criteria

1. **Code fences** render correctly during streaming (no content spillover)
2. **Tables** render as tables during streaming (no flickering between table/text rendering)
3. **HTML blocks** do not consume content outside their boundaries during streaming
4. **Plain text** outside of block structures streams with no additional delay
5. **Stream completion** renders the full response identically to a non-streaming response
6. **Abort** during streaming leaves the document in a clean state
7. **Performance**: No perceptible increase in streaming latency for typical responses
8. **Buffer safety**: Very long code blocks (>10KB) still display, with possible brief artifact
9. **All tests pass**: Existing test suite + new MarkdownBlockDetector tests
10. **Build succeeds**: `yarn build` and `yarn lint` pass

---

## Files to Create

| File | Type | Purpose |
|------|------|---------|
| `src/Utilities/MarkdownBlockDetector.ts` | New | Markdown block detection logic |
| `src/Utilities/MarkdownBlockDetector.test.ts` | New | Unit tests for block detector |

## Files to Modify

| File | Changes |
|------|---------|
| `src/Services/StreamingHandler.ts` | Import detector, modify flush(), add forceFlush(), add safety valve |

## Files NOT Modified

| File | Reason |
|------|--------|
| `src/Utilities/StreamingHelpers.ts` | Low-level insertion unchanged |
| `src/Services/AiProviderService.ts` | Stream consumption unchanged |
| `src/Services/ApiService.ts` | Transport unchanged |
| `src/Services/MessageService.ts` | Post-stream processing unchanged |
| `styles.css` | No CSS changes needed |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Edge case markdown structures not detected | Safety valve flushes everything beyond threshold; stream completion flushes all |
| Buffer grows too large for long code blocks | MAX_BUFFER_SIZE safety valve (10KB default) |
| Performance regression from block scanning | findSafeFlushPoint operates on small buffers (<1KB typical); profile if needed |
| Regression in existing streaming behavior | Existing tests remain; add new tests for detector |
| Cursor position tracking issues | flushBufferedText cursor management is unchanged; only the text content per call changes |

---

## Future Enhancements (Out of Scope)

1. **Progressive code block rendering**: Show code content inside a code block as it arrives (requires closing fence placeholder approach -- more complex)
2. **AI SDK smoothStream integration**: Add line-based chunking as a complementary layer if edge cases persist
3. **User-configurable buffer settings**: Let users choose between "fast display" (no block detection) and "clean rendering" (block detection enabled)
4. **Obsidian Reading View support**: Ensure clean rendering when switching to reading view during streaming
