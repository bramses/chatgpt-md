# Task 6: Remove Unused Dependencies

## Priority: LOW
## Impact: Reduced coupling
## Risk: Low

## Problem

Provider services may have dependencies they don't actually use after the AI SDK migration.

## Analysis Required

Before making changes, audit each dependency:

### Dependencies in BaseAiService

| Dependency | Used For | Still Needed? |
|------------|----------|---------------|
| `notificationService` | Warnings, errors | Yes |
| `errorService` | API error handling | Yes |
| `apiService` | `createFetchAdapter()`, `stopStreaming()`, `wasAborted()` | Yes |
| `apiAuthService` | `getApiKey()` | Yes |
| `apiResponseParser` | `insertAssistantHeader()` | Check usage |

### Audit apiResponseParser

Search for usage:
```bash
grep -r "apiResponseParser" src/Services/
```

Current usage in `callAiSdkStreamText`:
```typescript
const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, modelName);
```

If this is the only usage, consider:
1. Moving `insertAssistantHeader()` to `BaseAiService` directly
2. Or keeping `apiResponseParser` (it's a small dependency)

## Files to Modify

- `src/Services/AiService.ts`
- `src/Services/ApiResponseParser.ts` (if moving method)

## Implementation Steps (if moving insertAssistantHeader)

### Step 1: Copy method to BaseAiService

If `insertAssistantHeader` is only used by AI services, move it:

```typescript
// Add to BaseAiService
protected insertAssistantHeader(
  editor: Editor,
  headingPrefix: string,
  modelName: string
): { initialCursor: EditorPosition; newCursor: EditorPosition } {
  const cursor = editor.getCursor();

  // Insert newlines and header
  const header = `\n\n${headingPrefix}role::assistant (${modelName})\n\n`;
  editor.replaceRange(header, cursor);

  // Calculate positions
  const initialCursor = { ...cursor };
  const newOffset = editor.posToOffset(cursor) + header.length;
  const newCursor = editor.offsetToPos(newOffset);

  return { initialCursor, newCursor };
}
```

### Step 2: Update callAiSdkStreamText

Replace:
```typescript
const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, modelName);
```

With:
```typescript
const cursorPositions = this.insertAssistantHeader(editor, headingPrefix, modelName);
```

### Step 3: Remove apiResponseParser from BaseAiService

If no longer needed:
1. Remove the field declaration
2. Remove from constructor initialization
3. Remove import

## Alternative: Keep apiResponseParser

If `ApiResponseParser` has other useful methods or is used elsewhere, keep it. The goal is simplicity - don't remove something if it causes more complexity elsewhere.

## Testing

1. Verify streaming still shows assistant header correctly
2. Verify cursor positioning after response
3. Test all providers

## Verification

```bash
npm run build
npm run lint
```

## Notes

This is a lower-priority optimization. Only do this if:
1. It genuinely simplifies the code
2. It doesn't create new problems
3. The methods are truly only used in one place
