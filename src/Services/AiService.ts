import { Message } from "src/Models/Message";
import { Editor, MarkdownView, Notice } from "obsidian";
import { fetchAvailableOpenAiModels, OpenAIConfig, OpenAiService } from "src/Services/OpenAiService";
import { StreamManager } from "src/stream";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { fetchAvailableOllamaModels, OllamaConfig, OllamaService } from "src/Services/OllamaService";
import { fetchAvailableOpenRouterModels, OpenRouterConfig, OpenRouterService } from "src/Services/OpenRouterService";
import { EditorService } from "src/Services/EditorService";

export interface IAiApiService {
  callAIAPI(
    messages: Message[],
    options: Partial<OpenAIConfig> | Partial<OllamaConfig> | Partial<OpenRouterConfig>,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any>;

  inferTitle(
    view: MarkdownView,
    settings: Partial<OpenAIConfig> | Partial<OllamaConfig> | Partial<OpenRouterConfig>,
    messages: string[],
    editorService: EditorService
  ): any;
}

export const fetchAvailableModels = async (url: string, apiKey: string, openrouterApiKey: string) => {
  try {
    const ollamaModels = await fetchAvailableOllamaModels();
    const openAiModels = await fetchAvailableOpenAiModels(url, apiKey);
    const openRouterModels = await fetchAvailableOpenRouterModels(openrouterApiKey);

    return [...ollamaModels, ...openAiModels, ...openRouterModels];
  } catch (error) {
    new Notice("Error fetching models: " + error);
    console.error("Error fetching models:", error);
    throw error;
  }
};

export interface OpenAiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface OllamaModel {
  name: string;
}

export const getAiApiService = (streamManager: StreamManager, settings: any): IAiApiService => {
  switch (settings) {
    case AI_SERVICE_OPENAI:
      return new OpenAiService(streamManager);
    case AI_SERVICE_OLLAMA:
      return new OllamaService(streamManager);
    case AI_SERVICE_OPENROUTER:
      return new OpenRouterService(streamManager);
    default:
      throw new Error("Unsupported API type");
  }
};

export const aiProviderFromUrl = (url?: string, model?: string): string => {
  const trimmedUrl = (url ?? "").trim().toLowerCase();
  const trimmedModel = (model ?? "").trim().toLowerCase();

  if (trimmedModel.includes("@")) {
    const provider = trimmedModel.split("@")[0];
    if (["local", AI_SERVICE_OLLAMA].includes(provider)) return AI_SERVICE_OLLAMA;
    if (provider === AI_SERVICE_OPENAI) return AI_SERVICE_OPENAI;
    if (provider === AI_SERVICE_OPENROUTER) return AI_SERVICE_OPENROUTER;
  }

  if (trimmedUrl.startsWith("http://localhost") || trimmedUrl.startsWith("http://127.0.0.1")) {
    return AI_SERVICE_OLLAMA;
  }

  if (trimmedUrl.includes("openrouter.ai")) {
    return AI_SERVICE_OPENROUTER;
  }

  return AI_SERVICE_OPENAI;
};
