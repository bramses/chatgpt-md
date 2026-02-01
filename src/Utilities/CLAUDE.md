# Utilities

Pure helper functions extracted from services for reusability and testability.

## Text Processing

### TextHelpers.ts

**Text formatting utilities**

- `getHeadingPrefix(level)` - Returns `"### "` for heading level 3
- `sanitizeTitle(title)` - Remove invalid filename characters
- Other text manipulation helpers

### MessageHelpers.ts

**Message formatting utilities**

- Message role extraction
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

- Buffer management
- Chunk processing

## Configuration Utilities

### FrontmatterHelpers.ts

**Frontmatter parsing utilities**

- `isTitleTimestampFormat(title, format)` - Check if title matches date format
- YAML parsing helpers

### ProviderHelpers.ts

**AI provider utilities**

- Provider detection from model string
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
