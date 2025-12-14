import { Editor, requestUrl } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_GEMINI, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { createGoogleGenerativeAI, GoogleGenerativeAIProvider } from "@ai-sdk/google";
import { ToolService } from "./ToolService";

export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  apiKey: "",
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

export const fetchAvailableGeminiModels = async (url: string, apiKey: string) => {
  try {
    if (!isValidApiKey(apiKey)) {
      console.error("Gemini API key is missing. Please add your Gemini API key in the settings.");
      return [];
    }

    // Call the Gemini models API endpoint
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

    // Extract model names from the response and add gemini@ prefix
    if (data.models && Array.isArray(data.models)) {
      return data.models
        .filter((model: any) => {
          // Filter for text generation models only
          return (
            model.name &&
            model.supportedGenerationMethods &&
            model.supportedGenerationMethods.includes("generateContent") &&
            !model.name.includes("embedding")
          );
        })
        .map((model: any) => {
          // Extract model name from full path (e.g., "models/gemini-1.5-pro" -> "gemini-1.5-pro")
          const modelName = model.name.replace("models/", "");
          return `gemini@${modelName}`;
        })
        .sort(); // Sort alphabetically for better UX
    }

    console.warn("Unexpected response format from Gemini models API");
    return [];
  } catch (error) {
    console.error("Error fetching Gemini models:", error);
    // Return empty array on error - the UI should handle this gracefully
    return [];
  }
};

export class GeminiService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_GEMINI;
  protected provider: GoogleGenerativeAIProvider;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    super(errorService, notificationService);
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService(this.notificationService);
    this.apiResponseParser = apiResponseParser || new ApiResponseParser(this.notificationService);
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

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // Gemini uses system field, not message role
  }

  protected supportsSystemField(): boolean {
    return false; // Gemini doesn't support separate system field - system messages are included in contents
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
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Gemini provider
    this.provider = createGoogleGenerativeAI({
      apiKey: apiKey,
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
    config: GeminiConfig,
    settings?: ChatGPT_MDSettings,
    provider?: GoogleGenerativeAIProvider,
    toolService?: ToolService
  ): Promise<any> {
    // Create a fetch adapter that uses Obsidian's requestUrl
    const customFetch = this.apiService.createFetchAdapter();

    // Initialize the Gemini provider
    this.provider = createGoogleGenerativeAI({
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

export interface GeminiConfig {
  apiKey: string;
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
