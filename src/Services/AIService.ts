import { Message } from "../Models/Message";
import { Editor, MarkdownView } from "obsidian";
import { OpenAIConfig, OpenAIService } from "./OpenAIService";
import { StreamManager } from "../stream";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI } from "../Constants";
import { OllamaService } from "./OllamaService";
import { ChatGPT_MDSettings } from "../Models/Config";
import { EditorService } from "./EditorService";

export interface IAIService {
  callAIAPI(
    messages: Message[],
    options: Partial<OpenAIConfig>,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any>;

  inferTitle(
    editor: Editor,
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): any;
}

export const getApiService = (streamManager: StreamManager, settings: any): IAIService => {
  switch (settings) {
    case AI_SERVICE_OPENAI:
      return new OpenAIService(streamManager);
    case AI_SERVICE_OLLAMA:
      return new OllamaService(streamManager);
    default:
      throw new Error("Unsupported API type");
  }
};
