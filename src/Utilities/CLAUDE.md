# Utilities

Pure helper functions extracted from services for reusability and testability. Functions here have no side effects and are covered by Jest tests.

## Text Processing

### TextHelpers.ts

**Text formatting utilities**

- `getHeadingPrefix(level)` - Returns `"### "` for heading level 3, etc.
- `sanitizeTitle(title)` - Remove invalid filename characters
- Other text manipulation helpers

### MessageHelpers.ts

**Message formatting utilities**

- Message role extraction (parses `role::assistant` format)
- Content formatting
- Message array manipulation

## Editor Utilities

### EditorHelpers.ts

**Editor manipulation helpers**

- Cursor positioning
- Text insertion
- Range operations

### ResponseHelpers.ts

**AI response handling**

- `insertAssistantHeader(editor, headingPrefix, modelName)` - Insert response header
- Response formatting

### StreamingHelpers.ts

**Streaming utilities**

- Buffer management (reduces editor updates for smoother UX)
- Chunk processing

## Configuration Utilities

### FrontmatterHelpers.ts

**Frontmatter parsing utilities**

- `isTitleTimestampFormat(title, format)` - Check if title matches date format
- YAML parsing helpers

### ProviderHelpers.ts

**AI provider utilities**

- Provider detection from model string (e.g., `ollama@model` → "ollama")
- URL construction

## Validation

### InputValidator.ts

**Input validation utilities**

- API key validation
- URL validation
- Model name validation

### ModelFilteringHelper.ts

**Model list filtering**

- Filter models by provider
- Search/fuzzy matching

## Error Handling

### AsyncErrorHandler.ts

**Async error handling utilities**

- Error wrapping
- Retry logic

### ErrorMessageFormatter.ts

**User-friendly error messages**

- HTTP status code mapping
- Error message formatting

## Modal Utilities

### ModalHelpers.ts

**Modal construction helpers**

- Common modal patterns
- Button creation
- Form helpers

## Testing

Tests are located alongside utilities in `*.test.ts` files:

- `TextHelpers.test.ts`
- `MessageHelpers.test.ts`
- `FrontmatterHelpers.test.ts`
- Others

Run tests with: `yarn test` or `yarn test path/to/test.test.ts`
