import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OLLAMA, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService, StreamingResponse } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { createOpenAICompatible, OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import { ToolService } from "./ToolService";

export interface OllamaModel {
  name: string;
  [key: string]: any;
}

export interface OllamaConfig {
  apiKey?: string;
  aiService: string;
  model: string;
  url: string;
  stream: boolean;
  title?: string;
  system_commands?: string[] | null;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  aiService: AI_SERVICE_OLLAMA,
  model: "",
  url: "http://localhost:11434",
  stream: true,
  title: "Untitled",
  system_commands: null,
};

export const fetchAvailableOllamaModels = async (url: string) => {
  try {
    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = { "Content-Type": "application/json" };

    const json = await apiService.makeGetRequest(`${url}/api/tags`, headers, AI_SERVICE_OLLAMA);
    const models = json.models;

    return models
      .sort((a: OllamaModel, b: OllamaModel) => {
        if (a.name < b.name) return 1;
        if (a.name > b.name) return -1;
        return 0;
      })
      .map((model: OllamaModel) => `ollama@${model.name}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OllamaService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_OLLAMA;
  protected provider: OpenAICompatibleProvider;

  constructor() {
    super();
    this.provider = createOpenAICompatible({
      name: "ollama",
      baseURL: DEFAULT_OLLAMA_CONFIG.url,
    });
  }

  getDefaultConfig(): OllamaConfig {
    return DEFAULT_OLLAMA_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OLLAMA);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Ollama uses standard system role
  }

  protected supportsSystemField(): boolean {
    return false; // Ollama uses messages array, not system field
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OllamaConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<StreamingResponse> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Ollama provider (OpenAI-compatible)
    this.provider = createOpenAICompatible({
      name: "ollama",
      apiKey: apiKey || "ollama", // Ollama doesn't require real key
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK streaming method from base class
    return this.callAiSdkStreamText(
      this.provider(modelName),
      modelName,
      messages,
      config,
      editor,
      headingPrefix,
      setAtCursor,
      tools,
      toolService
    );
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OllamaConfig,
    settings?: ChatGPT_MDSettings,
    provider?: OpenAICompatibleProvider,
    toolService?: ToolService
  ): Promise<any> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Ollama provider (OpenAI-compatible)
    this.provider = createOpenAICompatible({
      name: "ollama",
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });

    // Extract model name (remove provider prefix if present)
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), modelName, messages, tools, toolService);
  }
}
