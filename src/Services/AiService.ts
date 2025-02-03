import { Message } from "src/Models/Message";
import { Editor, MarkdownView } from "obsidian";
import { OpenAIConfig, OpenAiService } from "src/Services/OpenAiService";
import { StreamManager } from "src/stream";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI } from "src/Constants";
import { OllamaConfig, OllamaService } from "src/Services/OllamaService";
import { EditorService } from "src/Services/EditorService";

export interface IAiApiService {
  callAIAPI(
    messages: Message[],
    options: Partial<OpenAIConfig> | Partial<OllamaConfig>,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any>;

  inferTitle(
    view: MarkdownView,
    settings: Partial<OpenAIConfig> | Partial<OllamaConfig>,
    messages: string[],
    editorService: EditorService
  ): any;
}

export const getAiApiService = (streamManager: StreamManager, settings: any): IAiApiService => {
  switch (settings) {
    case AI_SERVICE_OPENAI:
      return new OpenAiService(streamManager);
    case AI_SERVICE_OLLAMA:
      return new OllamaService(streamManager);
    default:
      throw new Error("Unsupported API type");
  }
};
