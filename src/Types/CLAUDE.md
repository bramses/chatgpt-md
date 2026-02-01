# Types

TypeScript type definitions for AI services.

## AiTypes.ts

**Core AI service interfaces and types**

### IAiApiService

Contract for AI service implementations:

```typescript
interface IAiApiService {
  callAiAPI(
    messages: Message[],
    options: Record<string, any>,
    headingPrefix: string,
    url: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{ fullString: string; mode: string; wasAborted?: boolean }>;

  inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string>;

  fetchAvailableModels(
    url: string,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    providerType?: string
  ): Promise<string[]>;
}
```

### AiProvider

Union type of all Vercel AI SDK provider types:

```typescript
type AiProvider =
  | OpenAIProvider
  | OpenAICompatibleProvider
  | AnthropicProvider
  | GoogleGenerativeAIProvider
  | OpenRouterProvider;
```

### StreamingResponse

Response type for streaming API calls:

```typescript
type StreamingResponse = {
  fullString: string;
  mode: "streaming";
  wasAborted?: boolean;
};
```

### OllamaModel

Model interface for Ollama API responses:

```typescript
interface OllamaModel {
  name: string;
}
```
