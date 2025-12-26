import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, ROLE_DEVELOPER } from "src/Constants";
import { BaseAiService, IAiApiService, OpenAiModel } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { isValidApiKey } from "./ApiAuthService";
import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { ToolService } from "./ToolService";
import { detectToolSupport } from "./ToolSupportDetector";
import { ModelCapabilitiesCache } from "src/Models/ModelCapabilities";

/**
 * Filter predicate for valid OpenAI chat models
 * Excludes audio, transcription, realtime, and TTS models
 */
const isValidOpenAiChatModel = (model: OpenAiModel): boolean => {
  const id = model.id;
  const isGenerationModel =
    id.includes("o3") ||
    id.includes("o4") ||
    id.includes("o1") ||
    id.includes("gpt-4") ||
    id.includes("gpt-5") ||
    id.includes("gpt-3");

  const isExcluded =
    id.includes("audio") ||
    id.includes("transcribe") ||
    id.includes("realtime") ||
    id.includes("o1-pro") ||
    id.includes("tts");

  return isGenerationModel && !isExcluded;
};

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  aiService: AI_SERVICE_OPENAI,
  frequency_penalty: 0,
  max_tokens: 400,
  model: "openai@gpt-4.1-mini",
  presence_penalty: 0,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://api.openai.com",
};

export class OpenAiService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_OPENAI;
  protected provider: OpenAIProvider;

  constructor(capabilitiesCache?: ModelCapabilitiesCache) {
    super(capabilitiesCache);
  }

  getDefaultConfig(): OpenAIConfig {
    return DEFAULT_OPENAI_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
  }

  async fetchAvailableModels(url: string, apiKey?: string, settings?: ChatGPT_MDSettings): Promise<string[]> {
    try {
      if (!apiKey || !isValidApiKey(apiKey)) {
        console.error("OpenAI API key is missing. Please add your OpenAI API key in the settings.");
        return [];
      }

      const headers = this.apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENAI);
      const models = await this.apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_OPENAI);

      return models.data
        .filter(isValidOpenAiChatModel)
        .sort((a: OpenAiModel, b: OpenAiModel) => {
          if (a.id < b.id) return 1;
          if (a.id > b.id) return -1;
          return 0;
        })
        .map((model: OpenAiModel) => {
          const fullId = `openai@${model.id}`;

          // Detect tool support using centralized detector
          const whitelist = settings?.toolEnabledModels || "";
          const supportsTools = detectToolSupport(model.id, whitelist);
          if (this.capabilitiesCache) {
            this.capabilitiesCache.setSupportsTools(fullId, supportsTools);
            console.log(`[OpenAI] Cached: ${fullId} -> Tools: ${supportsTools}`);
          }

          return fullId;
        });
    } catch (error) {
      console.error("Error fetching OpenAI models:", error);
      return [];
    }
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_DEVELOPER; // OpenAI prefers developer role for system messages
  }

  protected supportsSystemField(): boolean {
    return false; // OpenAI uses messages array, not system field
  }

  /**
   * Initialize the OpenAI provider with the given configuration
   */
  private ensureProvider(apiKey: string | undefined, config: OpenAIConfig): void {
    const customFetch = this.apiService.createFetchAdapter();
    this.provider = createOpenAI({
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    this.ensureProvider(apiKey, config);

    // Extract model name (remove provider prefix if present)
    const modelName = this.extractModelName(config.model);

    // Get tools if enabled
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
    config: OpenAIConfig,
    settings?: ChatGPT_MDSettings,
    provider?: OpenAIProvider,
    toolService?: ToolService
  ): Promise<any> {
    this.ensureProvider(apiKey, config);

    // Extract model name (remove provider prefix if present)
    const modelName = this.extractModelName(config.model);

    // Get tools if enabled
    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), config.model, messages, tools, toolService, settings);
  }
}

export interface OpenAIConfig {
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
