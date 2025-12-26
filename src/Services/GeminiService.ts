import { Editor, requestUrl } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_GEMINI, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { isValidApiKey } from "./ApiAuthService";
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from "@ai-sdk/google";
import { ToolService } from "./ToolService";
import { detectToolSupport } from "./ToolSupportDetector";
import { ModelCapabilitiesCache } from "src/Models/ModelCapabilities";

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  aiService: AI_SERVICE_GEMINI,
  max_tokens: 400,
  model: "gemini@gemini-2.5-flash",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 0.95,
  url: "https://generativelanguage.googleapis.com",
};

export class GeminiService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_GEMINI;
  protected provider: GoogleGenerativeAIProvider;

  constructor(capabilitiesCache?: ModelCapabilitiesCache) {
    super(capabilitiesCache);
    // Use the dedicated Google Generative AI provider from @ai-sdk/google
    this.provider = createGoogleGenerativeAI({
      apiKey: "", // Will be set per request via headers
    });
  }

  getDefaultConfig(): GeminiConfig {
    return DEFAULT_GEMINI_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_GEMINI);
  }

  async fetchAvailableModels(url: string, apiKey?: string, settings?: ChatGPT_MDSettings): Promise<string[]> {
    try {
      if (!apiKey || !isValidApiKey(apiKey)) {
        console.error("Gemini API key is missing. Please add your Gemini API key in the settings.");
        return [];
      }

      const modelsUrl = `${url.replace(/\/$/, "")}/v1beta/models`;

      const response = await requestUrl({
        url: modelsUrl,
        method: "GET",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
      });

      const data = response.json;

      if (data.models && Array.isArray(data.models)) {
        return data.models
          .filter((model: any) => {
            return (
              model.name &&
              model.supportedGenerationMethods &&
              model.supportedGenerationMethods.includes("generateContent") &&
              !model.name.includes("embedding")
            );
          })
          .map((model: any) => {
            const modelName = model.name.replace("models/", "");
            const fullId = `gemini@${modelName}`;

            // Pattern-based detection for Gemini
            const whitelist = settings?.toolEnabledModels || "";
            const supportsTools = detectToolSupport("gemini", model.name, whitelist);
            if (this.capabilitiesCache) {
              this.capabilitiesCache.setSupportsTools(fullId, supportsTools);
              console.log(`[Gemini] Cached: ${fullId} -> Tools: ${supportsTools}`);
            }

            return fullId;
          })
          .sort();
      }

      console.warn("Unexpected response format from Gemini models API");
      return [];
    } catch (error) {
      console.error("Error fetching Gemini models:", error);
      return [];
    }
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Gemini uses system field, not message role
  }

  protected supportsSystemField(): boolean {
    return false; // Gemini doesn't support separate system field - system messages are included in contents
  }

  /**
   * Initialize the Gemini provider with the given configuration
   */
  private ensureProvider(apiKey: string | undefined, config: GeminiConfig): void {
    const customFetch = this.apiService.createFetchAdapter();
    this.provider = createGoogleGenerativeAI({
      apiKey: apiKey,
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: GeminiConfig,
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
    config: GeminiConfig,
    settings?: ChatGPT_MDSettings,
    provider?: GoogleGenerativeAIProvider,
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

export interface GeminiConfig {
  aiService: string;
  max_tokens: number;
  model: string;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  top_p: number;
  url: string;
}
