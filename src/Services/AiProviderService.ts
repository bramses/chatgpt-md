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
import { AiProvider, IAiApiService, StreamingResponse } from "src/Types/AiTypes";

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
import { CopilotAdapter } from "./Adapters/CopilotAdapter";
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
  private provider?: AiProvider;

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
      ["copilot", new CopilotAdapter()],
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
    options: Record<string, any> = {},
    headingPrefix: string,
    url: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<any> {
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
  private inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any): Promise<string> => {
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
        return response.fullString || response;
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
   */
  private ensureProvider(apiKey: string | undefined, config: AiProviderConfig): void {
    if (this.provider) {
      return;
    }

    const customFetch = this.apiService.createFetchAdapter();
    const providerFactory = this.getProviderFactory(this.currentAdapter.type, config.url);

    this.provider = providerFactory({
      apiKey: apiKey || "",
      baseURL: `${config.url}/v1`,
      fetch: customFetch,
    });
  }

  /**
   * Get the AI SDK provider factory for a given provider type
   * @param type - Provider type
   * @param url - Optional URL to determine API mode (used for Z.AI)
   */
  private getProviderFactory(type: ProviderType, url?: string): any {
    switch (type) {
      case "openai":
        return createOpenAI;
      case "anthropic":
        return createAnthropic;
      case "gemini":
        return createGoogleGenerativeAI;
      case "ollama":
      case "lmstudio":
        return createOpenAICompatible;
      case "zai":
        // Z.AI supports two API modes based on URL
        // - Standard API (OpenAI-compatible): /api/paas/v4
        // - Coding Plan (Anthropic-compatible): /api/anthropic
        if (url && url.includes("/api/anthropic")) {
          return createAnthropic;
        }
        return createOpenAICompatible;
      case "openrouter":
        return createOpenRouter;
      case "copilot":
        // Copilot uses its own SDK, not Vercel AI SDK
        // Return null - handled separately in callStreamingAPI/callNonStreamingAPI
        return null;
      default:
        throw new Error(`Unsupported provider: ${type}`);
    }
  }

  /**
   * Check if current provider is Copilot
   */
  private isCopilotProvider(): boolean {
    return this.currentAdapter.type === "copilot";
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
    // Handle Copilot separately - uses its own SDK
    if (this.isCopilotProvider()) {
      return this.callCopilotStreamingAPI(messages, config, editor, headingPrefix, setAtCursor, settings);
    }

    this.ensureProvider(apiKey, config);
    const modelName = this.extractModelName(config.model);
    const model = (this.provider as any)(modelName);

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
  ): Promise<any> {
    // Handle Copilot separately - uses its own SDK
    if (this.isCopilotProvider()) {
      return this.callCopilotNonStreamingAPI(messages, config, settings);
    }

    this.ensureProvider(apiKey, config);
    const modelName = this.extractModelName(config.model);
    const model = (this.provider as any)(modelName);

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
    tools?: Record<string, any>,
    toolService?: ToolService,
    settings?: ChatGPT_MDSettings
  ): Promise<{ fullString: string; model: string }> {
    const aiSdkMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    const request: any = {
      model,
      messages: aiSdkMessages,
    };

    const toolsAvailable = tools && Object.keys(tools).length > 0;
    const shouldUseTool = toolsAvailable && settings && this.modelSupportsTools(modelName, settings);

    if (shouldUseTool) {
      request.tools = tools;
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

      return { fullString: continuationResponse.text, model: modelName };
    }

    return { fullString: response.text, model: modelName };
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
    tools?: Record<string, any>,
    toolService?: ToolService,
    settings?: ChatGPT_MDSettings
  ): Promise<StreamingResponse> {
    const aiSdkMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    const cursorPositions = insertAssistantHeader(editor, headingPrefix, modelName);

    const abortController = new AbortController();
    this.apiService.setAbortController(abortController);

    const initialCursor = setAtCursor ? cursorPositions.initialCursor : cursorPositions.newCursor;
    let handler: StreamingHandler | undefined;

    try {
      handler = new StreamingHandler(editor, initialCursor, setAtCursor);
      handler.startBuffering();

      const request: any = {
        model,
        messages: aiSdkMessages,
        abortSignal: abortController.signal,
      };

      const toolsAvailable = tools && Object.keys(tools).length > 0;
      const shouldUseTool = toolsAvailable && settings && this.modelSupportsTools(modelName, settings);

      if (shouldUseTool) {
        request.tools = tools;
      }

      let fullText = "";
      let result: any;
      let finalResult: any;

      const consumeStream = async (streamResult: any): Promise<string> => {
        let text = "";
        const { textStream } = streamResult;

        for await (const textPart of textStream) {
          if (this.apiService.wasAborted()) {
            break;
          }
          text += textPart;
          handler?.appendText(textPart);
        }

        return text;
      };

      try {
        result = streamText(request);
        fullText = await consumeStream(result);
        handler.stopBuffering();
        finalResult = await result;

        let actualFinishReason = finalResult?.finishReason;
        if (actualFinishReason && typeof actualFinishReason.then === "function") {
          try {
            actualFinishReason = await actualFinishReason;
          } catch (finishErr: any) {
            throw finishErr;
          }
        }
      } catch (err: any) {
        handler?.stopBuffering();
        throw err;
      }

      if (toolService && finalResult && finalResult.toolCalls) {
        const toolCalls = await finalResult.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          const toolNotice = "_[Tool approval required...]_\n";
          const indicatorCursor = handler.getCursor();
          editor.replaceRange(toolNotice, indicatorCursor);
          handler.updateCursorAfterInsert(toolNotice, indicatorCursor);

          const toolResults = await toolService.handleToolCalls(toolCalls, modelName);
          const { contextMessages } = await toolService.processToolResults(toolCalls, toolResults, modelName);

          const toolCursor = handler.getCursor();
          editor.replaceRange("", { line: toolCursor.line - 1, ch: 0 }, toolCursor);
          handler.setCursor({ line: toolCursor.line - 1, ch: 0 });

          const updatedMessages = [...aiSdkMessages];
          updatedMessages.push({ role: "assistant", content: fullText });
          updatedMessages.push(...contextMessages);

          const continuationResult = streamText({
            model,
            messages: updatedMessages,
          });

          const continuationCursor = handler.getCursor();
          handler.reset(continuationCursor);
          handler.startBuffering();

          try {
            for await (const textPart of continuationResult.textStream) {
              if (this.apiService.wasAborted()) break;
              fullText += textPart;
              handler.appendText(textPart);
            }
          } finally {
            handler.stopBuffering();
          }
        }
      }

      const finalCursor = handler.getCursor();
      if (!setAtCursor) {
        editor.setCursor(finalCursor);
      }

      return {
        fullString: fullText,
        mode: "streaming",
        wasAborted: this.apiService.wasAborted(),
      };
    } catch (err) {
      const errorMessage = `Error: ${err}`;
      const errorCursor = handler?.getCursor() || initialCursor;
      editor.replaceRange(errorMessage, errorCursor);
      return { fullString: errorMessage, mode: "streaming" };
    }
  }

  /**
   * Call the Copilot API in streaming mode
   * Uses the @github/copilot-sdk with proper lifecycle management (2026 best practices)
   */
  private async callCopilotStreamingAPI(
    messages: Message[],
    config: AiProviderConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean,
    settings?: ChatGPT_MDSettings
  ): Promise<StreamingResponse> {
    const modelName = this.extractModelName(config.model);

    // Check CLI availability
    const copilotAdapter = this.adapters.get("copilot") as any;
    const cliPath = settings?.copilotCliPath || undefined;
    const isCliAvailable = await copilotAdapter.isCliAvailable(cliPath);

    if (!isCliAvailable) {
      throw new Error(copilotAdapter.getCliNotFoundError());
    }

    // Import the Copilot SDK dynamically to avoid loading on mobile
    let CopilotClient: any;
    try {
      const copilotSdk = await import("@github/copilot-sdk");
      CopilotClient = copilotSdk.CopilotClient;
    } catch (_err) {
      throw new Error("GitHub Copilot SDK not available. Please ensure @github/copilot-sdk is installed.");
    }

    const cursorPositions = insertAssistantHeader(editor, headingPrefix, modelName);

    const abortController = new AbortController();
    this.apiService.setAbortController(abortController);

    const initialCursor = setAtCursor ? cursorPositions.initialCursor : cursorPositions.newCursor;
    let handler: StreamingHandler | undefined;
    let client: any = null;
    let session: any = null;

    try {
      handler = new StreamingHandler(editor, initialCursor, setAtCursor);
      handler.startBuffering();

      // Create and start Copilot client
      const clientOptions: any = {
        autoStart: true,
        autoRestart: true,
      };
      if (cliPath) {
        clientOptions.cliPath = cliPath;
      }
      client = new CopilotClient(clientOptions);
      await client.start();

      // Extract system message if present and use "append" mode to preserve guardrails
      const systemMessage = messages.find((m) => m.role === "system")?.content;

      // Create session with streaming enabled
      const sessionOptions: any = {
        model: modelName,
        streaming: true,
      };
      if (systemMessage) {
        sessionOptions.systemMessage = {
          mode: "append",
          content: systemMessage,
        };
      }

      session = await client.createSession(sessionOptions);

      // Build the prompt from the last user message
      const lastUserMessage = messages.filter((m) => m.role === "user").pop();
      const prompt = lastUserMessage?.content || "";

      let fullText = "";

      // Set up streaming with single event handler (2026 best practice)
      const streamPromise = new Promise<string>((resolve, reject) => {
        const unsubscribe = session.on((event: any) => {
          if (this.apiService.wasAborted()) {
            session.abort?.();
            unsubscribe?.();
            resolve(fullText);
            return;
          }

          switch (event.type) {
            case "assistant.message.delta":
              // Streaming delta content
              const deltaContent = event.data?.deltaContent || "";
              if (deltaContent) {
                fullText += deltaContent;
                handler?.appendText(deltaContent);
              }
              break;

            case "assistant.message":
              // Final complete message (always sent after deltas)
              // Use this as fallback if no deltas were received
              if (!fullText && event.data?.content) {
                fullText = event.data.content;
                handler?.appendText(fullText);
              }
              break;

            case "session.idle":
              // Processing complete
              unsubscribe?.();
              resolve(fullText);
              break;

            case "session.error":
              unsubscribe?.();
              reject(new Error(event.data?.message || "Copilot session error"));
              break;
          }
        });

        // Send the prompt
        session.send({ prompt }).catch((err: any) => {
          unsubscribe?.();
          reject(err);
        });
      });

      try {
        fullText = await streamPromise;
      } finally {
        handler.stopBuffering();
      }

      const finalCursor = handler.getCursor();
      if (!setAtCursor) {
        editor.setCursor(finalCursor);
      }

      return {
        fullString: fullText,
        mode: "streaming",
        wasAborted: this.apiService.wasAborted(),
      };
    } catch (err) {
      handler?.stopBuffering();
      const errorMessage = `Error: ${err}`;
      const errorCursor = handler?.getCursor() || initialCursor;
      editor.replaceRange(errorMessage, errorCursor);
      return { fullString: errorMessage, mode: "streaming" };
    } finally {
      // Clean up resources (always use try-finally per best practices)
      if (session) {
        try {
          await session.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      if (client) {
        try {
          await client.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Call the Copilot API in non-streaming mode
   * Uses the @github/copilot-sdk with proper lifecycle management (2026 best practices)
   */
  private async callCopilotNonStreamingAPI(
    messages: Message[],
    config: AiProviderConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<{ fullString: string; model: string }> {
    const modelName = this.extractModelName(config.model);

    // Check CLI availability
    const copilotAdapter = this.adapters.get("copilot") as any;
    const cliPath = settings?.copilotCliPath || undefined;
    const isCliAvailable = await copilotAdapter.isCliAvailable(cliPath);

    if (!isCliAvailable) {
      throw new Error(copilotAdapter.getCliNotFoundError());
    }

    // Import the Copilot SDK dynamically
    let CopilotClient: any;
    try {
      const copilotSdk = await import("@github/copilot-sdk");
      CopilotClient = copilotSdk.CopilotClient;
    } catch (_err) {
      throw new Error("GitHub Copilot SDK not available. Please ensure @github/copilot-sdk is installed.");
    }

    let client: any = null;
    let session: any = null;

    try {
      // Create and start Copilot client
      const clientOptions: any = {
        autoStart: true,
        autoRestart: true,
      };
      if (cliPath) {
        clientOptions.cliPath = cliPath;
      }
      client = new CopilotClient(clientOptions);
      await client.start();

      // Extract system message if present and use "append" mode to preserve guardrails
      const systemMessage = messages.find((m) => m.role === "system")?.content;

      // Create session
      const sessionOptions: any = {
        model: modelName,
      };
      if (systemMessage) {
        sessionOptions.systemMessage = {
          mode: "append",
          content: systemMessage,
        };
      }

      session = await client.createSession(sessionOptions);

      // Build the prompt from the last user message
      const lastUserMessage = messages.filter((m) => m.role === "user").pop();
      const prompt = lastUserMessage?.content || "";

      // Use sendAndWait for non-streaming response (waits for session.idle)
      const response = await session.sendAndWait({ prompt });

      // sendAndWait returns a string directly in 2026 SDK
      const responseText =
        typeof response === "string" ? response : response?.content || response?.text || String(response);

      return { fullString: responseText, model: modelName };
    } finally {
      // Clean up resources (always use try-finally per best practices)
      if (session) {
        try {
          await session.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
      if (client) {
        try {
          await client.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}
