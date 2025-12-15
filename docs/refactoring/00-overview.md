# YAGNI/KISS Refactoring Plan Overview

## Goal

Simplify the AI-SDK v6 implementation while preserving all features. Make the codebase easier to maintain for open-source contributors.

## Current Problems

1. **~600 lines of duplicated tool-handling logic** between streaming and non-streaming paths
2. **Provider services have identical constructor patterns** (5 optional dependencies with fallbacks)
3. **Model prefix parsing duplicated** across all 6 services
4. **ServiceLocator uses switch statement** instead of simple registry

## Tasks (in order)

| Task | File | Impact | Description |
|------|------|--------|-------------|
| [01-extract-tool-handling](./01-extract-tool-handling.md) | AiService.ts, ToolService.ts | ~300 lines removed | Extract duplicated tool logic |
| [02-simplify-constructors](./02-simplify-constructors.md) | All provider services | ~60 lines removed | Centralize dependency creation |
| [03-consolidate-model-parsing](./03-consolidate-model-parsing.md) | AiService.ts | Cleaner code | Single utility method |
| [04-simplify-service-locator](./04-simplify-service-locator.md) | ServiceLocator.ts | Easier extension | Registry pattern |
| [05-simplify-provider-detection](./05-simplify-provider-detection.md) | AiService.ts | ~40 lines removed | Cleaner logic |
| [06-remove-unused-deps](./06-remove-unused-deps.md) | Provider services | Reduced coupling | Audit dependencies |
| [07-cleanup-config-interfaces](./07-cleanup-config-interfaces.md) | Config.ts | Optional | Consolidate interfaces |

## Implementation Notes

- Each task can be implemented independently
- Run `npm run build` after each task to verify no regressions
- Run `npm run lint` to ensure code style compliance
- Test manually: chat streaming, title inference, tool calling

## Repository Structure

```
src/
├── Services/
│   ├── AiService.ts          # Base class + provider detection
│   ├── ToolService.ts        # Tool orchestration
│   ├── OpenAiService.ts      # OpenAI provider
│   ├── AnthropicService.ts   # Anthropic provider
│   ├── GeminiService.ts      # Gemini provider
│   ├── OllamaService.ts      # Ollama provider
│   ├── LmStudioService.ts    # LM Studio provider
│   └── OpenRouterService.ts  # OpenRouter provider
├── core/
│   └── ServiceLocator.ts     # DI container
└── Models/
    └── Config.ts             # Settings interfaces
```
