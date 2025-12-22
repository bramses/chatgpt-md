import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENROUTER, ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, StreamingResponse } from "src/Services/AiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiService } from "./ApiService";
import { createOpenRouter, OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { ToolService } from "./ToolService";
import { ServiceLocator } from "src/core/ServiceLocator";
import { CommandRegistry } from "src/core/CommandRegistry";

// Define a constant for OpenRouter service
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
  supported_parameters?: string[];
}

export interface OpenRouterConfig {
  apiKey: string;
  aiService: string;
  frequency_penalty: number;
  max_tokens: number;
  model: string;
  openrouterApiKey: string;
  presence_penalty: number;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;
  url: string;
}

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: "",
  aiService: AI_SERVICE_OPENROUTER,
  frequency_penalty: 0.5,
  max_tokens: 400,
  model: "openrouter@openai/gpt-4.1-mini",
  openrouterApiKey: "",
  presence_penalty: 0.5,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://openrouter.ai",
};

export class OpenRouterService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_OPENROUTER;
  protected provider: OpenRouterProvider;

  constructor() {
    super();
    this.provider = createOpenRouter();
  }

  getDefaultConfig(): OpenRouterConfig {
    return DEFAULT_OPENROUTER_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER);
  }

  async fetchAvailableModels(url: string, apiKey?: string): Promise<string[]> {
    try {
      if (!apiKey || !isValidApiKey(apiKey)) {
        console.error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
        return [];
      }

      const headers = this.apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENROUTER);
      const models = await this.apiService.makeGetRequest(`${url}/api/v1/models`, headers, AI_SERVICE_OPENROUTER);

      // Get capabilities cache from ServiceLocator
      const serviceLocator = ServiceLocator.getInstance();
      const commandRegistry = serviceLocator?.getCommandRegistry() as CommandRegistry | undefined;
      const capabilitiesCache = commandRegistry?.getModelCapabilities();

      return models.data
        .sort((a: OpenRouterModel, b: OpenRouterModel) => {
          if (a.id < b.id) return 1;
          if (a.id > b.id) return -1;
          return 0;
        })
        .map((model: OpenRouterModel) => {
          const fullId = `${AI_SERVICE_OPENROUTER}@${model.id}`;

          // Extract tool support from API response and store in cache
          if (capabilitiesCache && Array.isArray(model.supported_parameters)) {
            const supportsTools = model.supported_parameters.includes('tools');
            capabilitiesCache.setSupportsTools(fullId, supportsTools);
            console.log(`[OpenRouter] Cached: ${fullId} -> Tools: ${supportsTools}`);
          } else {
            console.log(`[OpenRouter] No cache or no supported_parameters for ${fullId}`);
          }

          return fullId;
        });
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      return [];
    }
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // OpenRouter uses standard system role
  }

  protected supportsSystemField(): boolean {
    return false; // OpenRouter uses messages array, not system field
  }

  /**
   * Initialize the OpenRouter provider with the given configuration
   */
  private ensureProvider(apiKey: string | undefined): void {
    const customFetch = this.apiService.createFetchAdapter();
    this.provider = createOpenRouter({
      apiKey: apiKey,
      fetch: customFetch,
    });
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<StreamingResponse> {
    this.ensureProvider(apiKey);

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
      toolService
    );
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig,
    settings?: ChatGPT_MDSettings,
    provider?: OpenRouterProvider,
    toolService?: ToolService
  ): Promise<any> {
    this.ensureProvider(apiKey);

    // Extract model name (remove provider prefix if present)
    const modelName = this.extractModelName(config.model);

    const tools = toolService?.getToolsForRequest(settings!);

    // Use the common AI SDK method from base class
    return this.callAiSdkGenerateText(this.provider(modelName), config.model, messages, tools, toolService);
  }
}
