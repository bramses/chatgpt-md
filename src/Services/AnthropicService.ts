import { Editor, requestUrl } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_ANTHROPIC, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { isValidApiKey } from "./ApiAuthService";
import { AnthropicProvider, createAnthropic } from "@ai-sdk/anthropic";
import { ToolService } from "./ToolService";
import { detectToolSupport } from "./ToolSupportDetector";
import { ModelCapabilitiesCache } from "src/Models/ModelCapabilities";

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  aiService: AI_SERVICE_ANTHROPIC,
  max_tokens: 400,
  model: "anthropic@claude-sonnet-4-20250514",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  url: "https://api.anthropic.com",
};

export class AnthropicService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_ANTHROPIC;
  protected provider: AnthropicProvider;

  constructor(capabilitiesCache?: ModelCapabilitiesCache) {
    super(capabilitiesCache);
  }

  getDefaultConfig(): AnthropicConfig {
    return DEFAULT_ANTHROPIC_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_ANTHROPIC);
  }

  async fetchAvailableModels(url: string, apiKey?: string, settings?: ChatGPT_MDSettings): Promise<string[]> {
    try {
      if (!apiKey || !isValidApiKey(apiKey)) {
        console.error("Anthropic API key is missing. Please add your Anthropic API key in the settings.");
        return [];
      }

      const modelsUrl = `${url.replace(/\/$/, "")}/v1/models`;

      const response = await requestUrl({
        url: modelsUrl,
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "Content-Type": "application/json",
        },
      });

      const data = response.json;

      if (data.data && Array.isArray(data.data)) {
        return data.data
          .filter((model: any) => model.type === "model" && model.id)
          .map((model: any) => {
            const fullId = `anthropic@${model.id}`;

            // Pattern-based detection: Claude 3+ models support tools
            const whitelist = settings?.toolEnabledModels || "";
            const supportsTools = detectToolSupport(model.id, whitelist);
            if (this.capabilitiesCache) {
              this.capabilitiesCache.setSupportsTools(fullId, supportsTools);
              console.log(`[Anthropic] Cached: ${fullId} -> Tools: ${supportsTools}`);
            }

            return fullId;
          })
          .sort();
      }

      console.warn("Unexpected response format from Anthropic models API");
      return [];
    } catch (error) {
      console.error("Error fetching Anthropic models:", error);
      return [];
    }
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Anthropic uses system field, not message role
  }

  protected supportsSystemField(): boolean {
    return true; // Anthropic supports system field in payload
  }

  /**
   * Initialize the Anthropic provider with the given configuration
   */
  private ensureProvider(apiKey: string | undefined, config: AnthropicConfig): void {
    const customFetch = this.apiService.createFetchAdapter();
    this.provider = createAnthropic({
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      headers: {
        "anthropic-dangerous-direct-browser-access": "true",
      },
      fetch: customFetch,
    });
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AnthropicConfig,
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
    config: AnthropicConfig,
    settings?: ChatGPT_MDSettings,
    provider?: AnthropicProvider,
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

export interface AnthropicConfig {
  aiService: string;
  max_tokens: number;
  model: string;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  url: string;
}
