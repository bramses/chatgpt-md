import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_LMSTUDIO, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService, OpenAiModel } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { createOpenAICompatible, OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import { ToolService } from "./ToolService";
import { ServiceLocator } from "src/core/ServiceLocator";
import { CommandRegistry } from "src/core/CommandRegistry";

export const DEFAULT_LMSTUDIO_CONFIG: LmStudioConfig = {
  aiService: AI_SERVICE_LMSTUDIO,
  frequency_penalty: 0,
  max_tokens: 400,
  model: "",
  presence_penalty: 0,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "http://localhost:1234",
};

export class LmStudioService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_LMSTUDIO;
  protected provider: OpenAICompatibleProvider;

  constructor() {
    super();
    this.provider = createOpenAICompatible({
      name: "lmstudio",
      baseURL: DEFAULT_LMSTUDIO_CONFIG.url,
    });
  }

  getDefaultConfig(): LmStudioConfig {
    return DEFAULT_LMSTUDIO_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_LMSTUDIO);
  }

  async fetchAvailableModels(url: string, apiKey?: string): Promise<string[]> {
    try {
      const headers =
        apiKey && isValidApiKey(apiKey)
          ? this.apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_LMSTUDIO)
          : { "Content-Type": "application/json" };

      const models = await this.apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_LMSTUDIO);

      // Get capabilities cache from ServiceLocator
      const serviceLocator = ServiceLocator.getInstance();
      const commandRegistry = serviceLocator?.getCommandRegistry() as CommandRegistry | undefined;
      const capabilitiesCache = commandRegistry?.getModelCapabilities();

      return models.data
        .filter(
          (model: OpenAiModel) =>
            !model.id.includes("embedding") &&
            !model.id.includes("audio") &&
            !model.id.includes("transcribe") &&
            !model.id.includes("tts")
        )
        .sort((a: OpenAiModel, b: OpenAiModel) => {
          if (a.id < b.id) return 1;
          if (a.id > b.id) return -1;
          return 0;
        })
        .map((model: OpenAiModel) => {
          const fullId = `lmstudio@${model.id}`;

          // Conservative: assume tools for common model names
          const supportsTools = model.id.includes("llama-3") || model.id.includes("mistral");
          if (capabilitiesCache) {
            capabilitiesCache.setSupportsTools(fullId, supportsTools);
            console.log(`[LM Studio] Cached: ${fullId} -> Tools: ${supportsTools}`);
          }

          return fullId;
        });
    } catch (error) {
      console.error("Error fetching LM Studio models:", error);
      return [];
    }
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // LmStudio uses standard system role
  }

  protected supportsSystemField(): boolean {
    return false; // LmStudio uses messages array, not system field
  }

  /**
   * Initialize the LM Studio provider (OpenAI-compatible) with the given configuration
   */
  private ensureProvider(apiKey: string | undefined, config: LmStudioConfig): void {
    const customFetch = this.apiService.createFetchAdapter();
    this.provider = createOpenAICompatible({
      name: "lmstudio",
      apiKey: apiKey || "lmstudio", // LM Studio doesn't require real key
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: LmStudioConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    this.ensureProvider(apiKey, config);

    // Extract model name (remove provider prefix if present)
    const modelName = this.extractModelName(config.model);

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK streaming method from base class
    return this.callAiSdkStreamText(
      this.provider(modelName),
      config.model,
      messages,
      config,
      editor,
      headingPrefix,
      setAtCursor,
      tools,
      toolService,
      settings
    );
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: LmStudioConfig,
    settings?: ChatGPT_MDSettings,
    provider?: OpenAICompatibleProvider,
    toolService?: ToolService
  ): Promise<any> {
    this.ensureProvider(apiKey, config);

    // Extract model name (remove provider prefix if present)
    const modelName = this.extractModelName(config.model);

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), config.model, messages, tools, toolService, settings);
  }
}

export interface LmStudioConfig {
  apiKey?: string;
  aiService: string;
  frequency_penalty: number;
  max_tokens: number;
  model: string;
  presence_penalty: number;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;
  url: string;
}
