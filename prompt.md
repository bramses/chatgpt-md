 You are tasked with refactoring the ChatGPT-MD Obsidian plugin to reduce complexity while preserving all functionality. This is an open-source project that should be easy to maintain.

  Context

  The ai-sdk-v6 branch migrated from custom HTTP handling to AI SDK v6. While functional, the implementation has unnecessary complexity:
  - ~600 lines of duplicated tool-handling code
  - Identical constructor patterns across 6 provider services
  - Duplicated model prefix parsing
  - Switch statement factory instead of registry pattern

  Your Task

  Implement the refactoring tasks documented in docs/refactoring/. Start with the overview:

  Read docs/refactoring/00-overview.md

  Then implement tasks in this order:
  1. 01-extract-tool-handling.md (HIGH priority - biggest impact)
  2. 02-simplify-constructors.md (HIGH priority)
  3. 04-simplify-service-locator.md (MEDIUM)
  4. 03-consolidate-model-parsing.md (MEDIUM)
  5. 05-simplify-provider-detection.md (MEDIUM)
  6. 06-remove-unused-deps.md (LOW - optional)
  7. 07-cleanup-config-interfaces.md (LOW - optional)

  Rules

  1. Preserve all features - streaming, non-streaming, tool calling, title inference, all 6 providers
  2. Run verification after each task:
  npm run build && npm run lint
  3. Follow the implementation steps exactly as documented in each task file
  4. Test manually if possible - chat with different providers, test tool calling
  5. Commit after each completed task with a descriptive message

  Key Files

  - src/Services/AiService.ts - Base class with tool handling (1133 lines)
  - src/Services/ToolService.ts - Tool orchestration (165 lines)
  - src/Services/OpenAiService.ts - Reference provider implementation
  - src/core/ServiceLocator.ts - DI container with factory method

  Expected Outcome

  - ~400-500 lines removed
  - Cleaner, more maintainable code
  - Easier to add new AI providers
  - All existing functionality preserved

  Getting Started

  # Ensure you're on the right branch
  git checkout ai-sdk-v6

  # Install dependencies
  npm install

  # Verify current state builds
  npm run build

  # Read the overview
  # Then start with Task 1
