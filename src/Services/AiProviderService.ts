import { Editor, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "./EditorService";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ToolService } from "./ToolService";
import { StreamingHandler } from "./StreamingHandler";
import { isModelWhitelisted } from "./ToolSupportDetector";
import { insertAssistantHeader } from "src/Utilities/ResponseHelpers";
import { AiProviderInstance, IAiApiService, ProviderFactory, StreamingResponse } from "src/Types/AiTypes";

// AI SDK providers
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, LanguageModel, streamText } from "ai";

// Adapters
import { AiProviderConfig, ProviderAdapter, ProviderType } from "./Adapters/ProviderAdapter";
import { OpenAIAdapter } from "./Adapters/OpenAIAdapter";
import { AnthropicAdapter } from "./Adapters/AnthropicAdapter";
import { OllamaAdapter } from "./Adapters/OllamaAdapter";
import { OpenRouterAdapter } from "./Adapters/OpenRouterAdapter";
import { GeminiAdapter } from "./Adapters/GeminiAdapter";
import { LmStudioAdapter } from "./Adapters/LmStudioAdapter";
import { ZaiAdapter } from "./Adapters/ZaiAdapter";

// Constants
import { NEWLINE, ROLE_USER, TITLE_INFERENCE_ERROR_HEADER, TRUNCATION_ERROR_INDICATOR } from "src/Constants";

/**
 * Unified AI Provider Service
 * Consolidates all AI provider logic into a single service using the adapter pattern
 * Replaces BaseAiService + 6 individual provider services
 */
export class AiProviderService implements IAiApiService {
  private apiService: ApiService;
  private apiAuthService: ApiAuthService;
  private readonly errorService: ErrorService;
  private readonly notificationService: NotificationService;

  // Adapter registry
  private adapters: Map<ProviderType, ProviderAdapter>;
  private currentAdapter: ProviderAdapter;

  // AI SDK provider instance (created per request)
  private provider?: AiProviderInstance;

  // Static callback for saving settings
  private static saveSettingsCallback: (() => Promise<void>) | null = null;

  constructor() {
    this.notificationService = new NotificationService();
    this.errorService = new ErrorService(this.notificationService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);

    // Register all adapters
    this.adapters = new Map<ProviderType, ProviderAdapter>([
      ["openai", new OpenAIAdapter()],
      ["anthropic", new AnthropicAdapter()],
      ["ollama", new OllamaAdapter()],
      ["openrouter", new OpenRouterAdapter()],
      ["gemini", new GeminiAdapter()],
      ["lmstudio", new LmStudioAdapter()],
      ["zai", new ZaiAdapter()],
    ]);

    // Default to OpenAI
    this.currentAdapter = this.adapters.get("openai")!;
  }

  /**
   * Set the callback for saving settings
   */
  public static setSaveSettingsCallback(callback: () => Promise<void>): void {
    AiProviderService.saveSettingsCallback = callback;
  }

  /**
   * Set the current provider adapter based on model string
   * @param model - Model ID with optional provider prefix (e.g., "openai@gpt-4" or "gpt-4")
   */
  private setProviderFromModel(model: string): void {
    // Extract provider from model prefix
    for (const [type, adapter] of this.adapters) {
      if (model.startsWith(`${type}@`)) {
        this.currentAdapter = adapter;
        return;
      }
    }

    // No prefix found - use default (OpenAI)
    this.currentAdapter = this.adapters.get("openai")!;
  }

  /**
   * Check if a model supports tools (whitelist check)
   */
  private modelSupportsTools(modelName: string, settings: ChatGPT_MDSettings): boolean {
    return isModelWhitelisted(modelName, settings.toolEnabledModels || "");
  }

  /**
   * Get the default configuration for the current provider
   */
  private getDefaultConfig(): AiProviderConfig {
    return {
      provider: this.currentAdapter.type,
      model: "",
      maxTokens: 400,
      temperature: 0.7,
      stream: true,
      url: this.currentAdapter.getDefaultBaseUrl(),
      title: "Untitled",
      system_commands: null,
      tags: null,
    };
  }

  /**
   * Get the API key from settings for the current provider
   */
  private getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, this.currentAdapter.type);
  }

  /**
   * Fetch available models from a specific provider
   * @param url - Base URL for API
   * @param apiKey - API key for authentication (if required)
   * @param settings - Plugin settings (unused, kept for API compatibility)
   * @param providerType - Optional provider type (defaults to current adapter)
   */
  async fetchAvailableModels(
    url: string,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    providerType?: ProviderType
  ): Promise<string[]> {
    try {
      // Set provider if specified
      if (providerType) {
        const adapter = this.adapters.get(providerType);
        if (adapter) {
          this.currentAdapter = adapter;
        }
      }

      if (!apiKey && this.currentAdapter.requiresApiKey()) {
        console.error(`${this.currentAdapter.displayName} API key is missing.`);
        return [];
      }

      return await this.currentAdapter.fetchModels(
        url,
        apiKey,
        settings,
        this.apiService.makeGetRequest.bind(this.apiService)
      );
    } catch (error) {
      console.error(`Error fetching ${this.currentAdapter.displayName} models:`, error);
      return [];
    }
  }

  /**
   * Call the AI API with the given parameters
   */
  async callAiAPI(
    messages: Message[],
    options: Partial<AiProviderConfig> = {},
    headingPrefix: string,
    url: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{ fullString: string; mode: string; wasAborted?: boolean }> {
    const config = { ...this.getDefaultConfig(), ...options };

    // Set provider from model
    this.setProviderFromModel(config.model);

    // Use URL from settings if available
    if (settings) {
      config.url = url;
    }

    return config.stream && editor
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings, toolService)
      : this.callNonStreamingAPI(apiKey, messages, config, settings, toolService);
  }

  /**
   * Infer a title from messages
   */
  async inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string> {
    try {
      if (!view.file) {
        throw new Error("No active file found");
      }

      const apiKey = this.getApiKeyFromSettings(settings);
      const titleResponse = await this.inferTitleFromMessages(apiKey, messages, settings);

      let titleStr = "";

      if (typeof titleResponse === "string") {
        if (this.isTruncationError(titleResponse)) {
          this.handleTitleTruncationError(view, titleResponse);
          this.showNoTitleInferredNotification();
          return "";
        }
        titleStr = titleResponse;
      } else if (titleResponse && typeof titleResponse === "object") {
        const responseObj = titleResponse as { fullString?: string };
        const responseText = responseObj.fullString || "";

        if (this.isTruncationError(responseText)) {
          this.handleTitleTruncationError(view, responseText);
          this.showNoTitleInferredNotification();
          return "";
        }

        titleStr = responseText;
      }

      if (titleStr && titleStr.trim().length > 0) {
        await editorService.writeInferredTitle(view, titleStr.trim());
        return titleStr.trim();
      } else {
        this.showNoTitleInferredNotification();
        return "";
      }
    } catch (error) {
      console.error("[ChatGPT MD] Error in inferTitle:", error);
      this.showNoTitleInferredNotification();
      return "";
    }
  }

  /**
   * Show a notification when title inference fails
   */
  private showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }

  /**
   * Check if response contains truncation error
   */
  private isTruncationError(response: string): boolean {
    return response.includes(TRUNCATION_ERROR_INDICATOR);
  }

  /**
   * Handle truncation error in title inference
   */
  private handleTitleTruncationError(view: MarkdownView, errorMessage: string): void {
    const editor = view.editor;
    const lastLine = editor.lastLine();
    const lastLineLength = editor.getLine(lastLine).length;
    const endCursor = { line: lastLine, ch: lastLineLength };
    editor.setCursor(endCursor);

    const headingPrefix = "#".repeat(2) + " ";
    const errorHeader = `\n---\n${headingPrefix}${TITLE_INFERENCE_ERROR_HEADER}\n`;
    editor.replaceRange(errorHeader + errorMessage + "\n", endCursor);
  }

  /**
   * Infer a title from messages
   */
  private inferTitleFromMessages = async (
    apiKey: string,
    messages: string[],
    settings: ChatGPT_MDSettings
  ): Promise<string> => {
    try {
      if (messages.length < 2) {
        this.notificationService.showWarning("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }

      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon (:), back slash (\\), forward slash (/), asterisk (*), question mark (?), double quote ("), less than (<), greater than (>), or pipe (|) as these are invalid in file names. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      const defaultConfig = this.getDefaultConfig();
      const config = {
        ...defaultConfig,
        ...settings,
      };

      if (!config.model) {
        config.model = defaultConfig.model;
      }

      if (!config.url) {
        config.url = defaultConfig.url;
      }

      try {
        const response = await this.callNonStreamingAPI(
          apiKey,
          [{ role: ROLE_USER, content: prompt }],
          config,
          settings
        );
        return response.fullString;
      } catch (apiError) {
        console.error(`[ChatGPT MD] Error calling API for title inference:`, apiError);
        return "";
      }
    } catch (err) {
      console.error(`[ChatGPT MD] Error inferring title:`, err);
      this.showNoTitleInferredNotification();
      return "";
    }
  };

  /**
   * Stop streaming
   */
  public stopStreaming(): void {
    this.apiService?.stopStreaming();
  }

  /**
   * Ensure the AI SDK provider is initialized
   *
   * URL Construction:
   * - Most providers: baseURL = https://api.openai.com + /v1 = https://api.openai.com/v1
   * - OpenRouter: baseURL = https://openrouter.ai + /api/v1 = https://openrouter.ai/api/v1
   * - The AI SDK appends the final endpoint (e.g., /chat/completions) to the baseURL
   */
  private ensureProvider(apiKey: string | undefined, config: AiProviderConfig): void {
    if (this.provider) {
      return;
    }

    const customFetch = this.apiService.createFetchAdapter();
    const providerFactory = this.getProviderFactory(this.currentAdapter.type, config.url);

    // Use adapter-specific path suffix instead of hardcoded "/v1"
    // This allows OpenRouter to use /api/v1 while others use /v1
    const apiPathSuffix = this.currentAdapter.getApiPathSuffix(config.url);

    this.provider = providerFactory({
      apiKey: apiKey || "",
      baseURL: `${config.url}${apiPathSuffix}`,
      fetch: customFetch,
      name: this.currentAdapter.type, // Required for OpenAICompatible providers
    });
  }

  /**
   * Get the AI SDK provider factory for a given provider type
   * @param type - Provider type
   * @param url - Optional URL to determine API mode (used for Z.AI)
   */
  private getProviderFactory(type: ProviderType, url?: string): ProviderFactory {
    switch (type) {
      case "openai":
        return createOpenAI;
      case "anthropic":
        return createAnthropic;
      case "gemini":
        return createGoogleGenerativeAI;
      case "ollama":
      case "lmstudio":
      case "zai":
        return createOpenAICompatible;
      case "openrouter":
        return createOpenRouter;
      default:
        throw new Error(`Unsupported provider: ${type}`);
    }
  }

  /**
   * Extract model name by removing provider prefix
   */
  private extractModelName(model: string): string {
    return this.currentAdapter.extractModelName(model);
  }

  /**
   * Call the AI API in streaming mode
   */
  private async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AiProviderConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<StreamingResponse> {
    this.ensureProvider(apiKey, config);
    const modelName = this.extractModelName(config.model);
    const model = this.provider!(modelName);

    // Get tools only if toolService is available and settings are provided
    const tools = toolService && settings ? toolService.getToolsForRequest(settings) : undefined;
    return this.callAiSdkStreamText(
      model,
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

  /**
   * Call the AI API in non-streaming mode
   */
  private async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: AiProviderConfig,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{ fullString: string; mode: string }> {
    this.ensureProvider(apiKey, config);
    const modelName = this.extractModelName(config.model);
    const model = this.provider!(modelName);

    // Get tools only if toolService is available and settings are provided
    const tools = toolService && settings ? toolService.getToolsForRequest(settings) : undefined;
    return this.callAiSdkGenerateText(model, config.model, messages, tools, toolService, settings);
  }

  /**
   * Common AI SDK generateText implementation
   */
  private async callAiSdkGenerateText(
    model: LanguageModel,
    modelName: string,
    messages: Message[],
    tools?: unknown,
    toolService?: ToolService,
    settings?: ChatGPT_MDSettings
  ): Promise<{ fullString: string; mode: string }> {
    const aiSdkMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    const request: Parameters<typeof generateText>[0] = {
      model,
      messages: aiSdkMessages,
    };

    const toolsAvailable = tools && typeof tools === "object" && Object.keys(tools as object).length > 0;
    const shouldUseTool = toolsAvailable && settings && this.modelSupportsTools(modelName, settings);

    if (shouldUseTool) {
      request.tools = tools as typeof request.tools;
    }

    let response;
    try {
      response = await generateText(request);
    } catch (err: any) {
      console.log(`[ChatGPT MD] Error during generateText:`, err);
      throw err;
    }

    if (toolService && response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = await toolService.handleToolCalls(response.toolCalls, modelName);
      const { contextMessages } = await toolService.processToolResults(response.toolCalls, toolResults, modelName);

      const updatedMessages = [...aiSdkMessages];

      if (response.text?.trim()) {
        updatedMessages.push({ role: "assistant", content: response.text });
      }

      updatedMessages.push(...contextMessages);

      const continuationResponse = await generateText({
        model,
        messages: updatedMessages,
      });

      return { fullString: continuationResponse.text, mode: "non-streaming" };
    }

    return { fullString: response.text, mode: "non-streaming" };
  }

  /**
   * Common AI SDK streamText implementation
   */
  private async callAiSdkStreamText(
    model: LanguageModel,
    modelName: string,
    messages: Message[],
    config: AiProviderConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean,
    tools?: unknown,
    toolService?: ToolService,
    settings?: ChatGPT_MDSettings
  ): Promise<StreamingResponse> {
    const { aiSdkMessages, handler, abortController } = this.setupStreamingContext(
      messages,
      editor,
      headingPrefix,
      modelName,
      setAtCursor
    );

    try {
      const request = this.buildStreamRequest(model, aiSdkMessages, abortController.signal, tools, modelName, settings);

      handler.startBuffering();
      const result = streamText(request);
      let fullText = await this.consumeStream(result, handler);
      const finalResult = await result;

      this.checkForStreamError(finalResult);

      // Handle tool calls if present
      if (toolService && finalResult?.toolCalls) {
        const toolCalls = await finalResult.toolCalls;
        if (toolCalls?.length > 0) {
          fullText = await this.handleStreamToolCalls(
            toolCalls,
            fullText,
            handler,
            editor,
            model,
            aiSdkMessages,
            toolService,
            modelName
          );
        }
      }

      if (!setAtCursor) {
        editor.setCursor(handler.getCursor());
      }

      return {
        fullString: fullText,
        mode: "streaming",
        wasAborted: this.apiService.wasAborted(),
      };
    } catch (err: any) {
      return this.handleStreamError(err, handler, editor);
    }
  }

  /**
   * Setup streaming context with abort controller and handler
   */
  private setupStreamingContext(
    messages: Message[],
    editor: Editor,
    headingPrefix: string,
    modelName: string,
    setAtCursor?: boolean
  ) {
    const aiSdkMessages = this.prepareAiSdkMessages(messages);
    const cursorPositions = insertAssistantHeader(editor, headingPrefix, modelName);

    const abortController = new AbortController();
    this.apiService.setAbortController(abortController);

    const initialCursor = setAtCursor ? cursorPositions.initialCursor : cursorPositions.newCursor;
    const handler = new StreamingHandler(editor, initialCursor, setAtCursor);

    return { aiSdkMessages, handler, abortController };
  }

  /**
   * Handle streaming error
   */
  private handleStreamError(err: any, handler: StreamingHandler, editor: Editor): StreamingResponse {
    handler.stopBuffering();
    const errorMessage = this.formatStreamError(err);
    const errorCursor = handler.getCursor();
    editor.replaceRange(errorMessage, errorCursor);
    return { fullString: errorMessage, mode: "streaming" };
  }

  /**
   * Prepare messages for AI SDK format
   */
  private prepareAiSdkMessages(messages: Message[]): Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }> {
    return messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));
  }

  /**
   * Build stream request with optional tools
   */
  private buildStreamRequest(
    model: LanguageModel,
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    abortSignal: AbortSignal,
    tools: unknown,
    modelName: string,
    settings?: ChatGPT_MDSettings
  ): Parameters<typeof streamText>[0] {
    const request: Parameters<typeof streamText>[0] = {
      model,
      messages,
      abortSignal,
    };

    const toolsAvailable = tools && typeof tools === "object" && Object.keys(tools as object).length > 0;
    const shouldUseTool = toolsAvailable && settings && this.modelSupportsTools(modelName, settings);

    if (shouldUseTool) {
      request.tools = tools as typeof request.tools;
    }

    return request;
  }

  /**
   * Consume stream and buffer to handler
   */
  private async consumeStream(streamResult: any, handler: StreamingHandler): Promise<string> {
    let text = "";
    const { textStream } = streamResult;

    for await (const textPart of textStream) {
      if (this.apiService.wasAborted()) {
        break;
      }
      text += textPart;
      handler.appendText(textPart);
    }

    handler.stopBuffering();
    return text;
  }

  /**
   * Check if stream finished with error
   */
  private async checkForStreamError(finalResult: any): Promise<void> {
    const finishReason = await finalResult?.finishReason;
    if (finishReason === "error") {
      const error = (finalResult as any).error;
      if (error) {
        throw error;
      }
      throw new Error("Stream finished with error");
    }
  }

  /**
   * Handle tool calls during streaming
   */
  private async handleStreamToolCalls(
    toolCalls: any[],
    fullText: string,
    handler: StreamingHandler,
    editor: Editor,
    model: LanguageModel,
    aiSdkMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    toolService: ToolService,
    modelName: string
  ): Promise<string> {
    // Insert tool notice
    const toolNotice = "_[Tool approval required...]_\n";
    const indicatorCursor = handler.getCursor();
    editor.replaceRange(toolNotice, indicatorCursor);
    handler.updateCursorAfterInsert(toolNotice, indicatorCursor);

    // Execute tools
    const toolResults = await toolService.handleToolCalls(toolCalls, modelName);
    const { contextMessages } = await toolService.processToolResults(toolCalls, toolResults, modelName);

    // Clean up notice
    const toolCursor = handler.getCursor();
    editor.replaceRange("", { line: toolCursor.line - 1, ch: 0 }, toolCursor);
    handler.setCursor({ line: toolCursor.line - 1, ch: 0 });

    // Continue with tool results
    const updatedMessages = [...aiSdkMessages, { role: "assistant" as const, content: fullText }, ...contextMessages];

    return this.streamContinuation(model, updatedMessages, handler, fullText);
  }

  /**
   * Stream continuation after tool calls
   */
  private async streamContinuation(
    model: LanguageModel,
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    handler: StreamingHandler,
    initialText: string
  ): Promise<string> {
    const continuationResult = streamText({ model, messages });

    const continuationCursor = handler.getCursor();
    handler.reset(continuationCursor);
    handler.startBuffering();

    let fullText = initialText;

    try {
      for await (const textPart of continuationResult.textStream) {
        if (this.apiService.wasAborted()) break;
        fullText += textPart;
        handler.appendText(textPart);
      }

      const continuationFinalResult = await continuationResult;
      this.checkForStreamError(continuationFinalResult);

      return fullText;
    } finally {
      handler.stopBuffering();
    }
  }

  /**
   * Format streaming error for display
   */
  private formatStreamError(err: any): string {
    let rootCause = err;

    // Unwrap retry errors
    while (rootCause?.cause && this.isRetryError(rootCause)) {
      rootCause = rootCause.cause;
    }

    let errorMessage = "Error: ";
    if (rootCause?.message) {
      errorMessage += rootCause.message;
    } else if (err?.message) {
      errorMessage += err.message;
    } else if (typeof err === "string") {
      errorMessage += err;
    } else {
      errorMessage += "Unknown error occurred";
    }

    if (rootCause?.name && rootCause.name !== "Error") {
      errorMessage = `Error (${rootCause.name}): ${errorMessage.replace("Error: ", "")}`;
    }

    if (err?.cause?.message && err?.cause !== rootCause) {
      errorMessage += `\n\nDetails: ${err.cause.message}`;
    }

    return errorMessage;
  }

  /**
   * Check if error is a retry error
   */
  private isRetryError(err: any): boolean {
    return err?.name === "AI_RetryError" || err?.message?.includes("Retry");
  }
}
