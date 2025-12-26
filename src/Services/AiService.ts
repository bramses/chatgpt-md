import { Editor, MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorService } from "./EditorService";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  API_ENDPOINTS,
  NEWLINE,
  ROLE_USER,
  TITLE_INFERENCE_ERROR_HEADER,
  TRUNCATION_ERROR_INDICATOR,
} from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { OpenAIProvider } from "@ai-sdk/openai";
import { OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import { AnthropicProvider } from "@ai-sdk/anthropic";
import { GoogleGenerativeAIProvider } from "@ai-sdk/google";
import { OpenRouterProvider } from "@openrouter/ai-sdk-provider";
import { generateText, LanguageModel, streamText } from "ai";
import { ToolService } from "./ToolService";
import { StreamingHandler } from "./StreamingHandler";
import { ModelCapabilitiesCache } from "src/Models/ModelCapabilities";

/**
 * Interface defining the contract for AI service implementations
 */

export interface IAiApiService {
  /**
   * Call the AI API with the given parameters
   */
  callAIAPI(
    messages: Message[],
    options: Record<string, any>,
    headingPrefix: string,
    url: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<{
    fullString: string;
    mode: string;
    wasAborted?: boolean;
  }>;

  /**
   * Infer a title from messages
   */
  inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string>;

  /**
   * Fetch available models for this service
   */
  fetchAvailableModels(url: string, apiKey?: string, settings?: ChatGPT_MDSettings): Promise<string[]>;
}

/**
 * Type for streaming API response
 */
export type StreamingResponse = {
  fullString: string;
  mode: "streaming";
  wasAborted?: boolean;
};

/**
 * Type definition for all supported AI providers
 */
export type AiProvider =
  | OpenAIProvider
  | OpenAICompatibleProvider
  | AnthropicProvider
  | GoogleGenerativeAIProvider
  | OpenRouterProvider;

/**
 * Base class for AI service implementations
 * Contains common functionality and defines abstract methods that must be implemented by subclasses
 */
export abstract class BaseAiService implements IAiApiService {
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected readonly errorService: ErrorService;
  protected readonly notificationService: NotificationService;
  protected capabilitiesCache?: ModelCapabilitiesCache;

  // Abstract property that subclasses must implement to specify their provider
  protected abstract provider: AiProvider;

  // Abstract property that subclasses must implement to specify their service type
  protected abstract serviceType: string;

  // Abstract property to specify the preferred role for system messages
  protected abstract getSystemMessageRole(): string;

  // Abstract property to specify if the service supports system field in payload
  protected abstract supportsSystemField(): boolean;

  // Static callback for saving settings (set once at plugin initialization)
  private static saveSettingsCallback: (() => Promise<void>) | null = null;

  /**
   * Set the callback for saving settings
   * This should be called once during plugin initialization
   */
  public static setSaveSettingsCallback(callback: () => Promise<void>): void {
    BaseAiService.saveSettingsCallback = callback;
  }

  constructor(capabilitiesCache?: ModelCapabilitiesCache) {
    this.notificationService = new NotificationService();
    this.errorService = new ErrorService(this.notificationService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);
    this.capabilitiesCache = capabilitiesCache;
  }

  /**
   * Check if a model is known to support tools (from cache only)
   */
  protected modelSupportsTools(modelName: string, settings: ChatGPT_MDSettings): boolean {
    // Only use cache as source of truth - default to false if not in cache
    const cachedSupport = this.capabilitiesCache?.supportsTools(modelName);
    return cachedSupport === true; // Default to false if undefined
  }

  /**
   * Helper method to handle truncation errors in title inference
   */
  private handleTitleTruncationError(view: MarkdownView, errorMessage: string): void {
    const editor = view.editor;
    // Move cursor to the end of the document
    const lastLine = editor.lastLine();
    const lastLineLength = editor.getLine(lastLine).length;
    const endCursor = { line: lastLine, ch: lastLineLength };
    editor.setCursor(endCursor);

    const headingPrefix = "#".repeat(2) + " "; // Use heading level 2 for error
    const errorHeader = `\n---\n${headingPrefix}${TITLE_INFERENCE_ERROR_HEADER}\n`;
    editor.replaceRange(errorHeader + errorMessage + "\n", endCursor);
  }

  /**
   * Helper method to check if response contains truncation error
   */
  private isTruncationError(response: string): boolean {
    return response.includes(TRUNCATION_ERROR_INDICATOR);
  }

  /**
   * Get the default configuration for this service
   */
  abstract getDefaultConfig(): Record<string, any>;

  /**
   * Call the AI API with the given parameters
   */
  async callAIAPI(
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

    // Use URL from settings if available
    if (settings) {
      config.url = url;
    }

    return options.stream && editor
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings, toolService)
      : this.callNonStreamingAPI(apiKey, messages, config, settings, this.provider, toolService);
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

      // Get the API key from settings
      const apiKey = this.getApiKeyFromSettings(settings);

      // Infer the title
      const titleResponse = await this.inferTitleFromMessages(apiKey, messages, settings);

      // Extract the title string - handle both string and object responses
      let titleStr = "";

      if (typeof titleResponse === "string") {
        // Check if this is a truncation error message
        if (this.isTruncationError(titleResponse)) {
          this.handleTitleTruncationError(view, titleResponse);
          this.showNoTitleInferredNotification();
          return "";
        }
        titleStr = titleResponse;
      } else if (titleResponse && typeof titleResponse === "object") {
        // Type assertion for the response object
        const responseObj = titleResponse as { fullString?: string };
        const responseText = responseObj.fullString || "";

        // Check if the object response contains a truncation error
        if (this.isTruncationError(responseText)) {
          this.handleTitleTruncationError(view, responseText);
          this.showNoTitleInferredNotification();
          return "";
        }

        titleStr = responseText;
      }

      // Only update the title if we got a valid non-empty title
      if (titleStr && titleStr.trim().length > 0) {
        // Update the title in the editor
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
  protected showNoTitleInferredNotification(): void {
    this.notificationService?.showWarning("Could not infer title. The file name was not changed.");
  }

  /**
   * Get the API key from settings
   */
  abstract getApiKeyFromSettings(settings: ChatGPT_MDSettings): string;

  /**
   * Fetch available models for this service
   * @param url The service endpoint URL
   * @param apiKey Optional API key (required for some services)
   * @param settings Optional settings containing whitelist configuration
   * @returns Array of model names with service prefix (e.g., "openai@gpt-4")
   */
  abstract fetchAvailableModels(url: string, apiKey?: string, settings?: ChatGPT_MDSettings): Promise<string[]>;

  /**
   * Call the AI API in streaming mode
   */
  protected abstract callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean,
    settings?: ChatGPT_MDSettings,
    toolService?: ToolService
  ): Promise<StreamingResponse>;

  /**
   * Call the AI API in non-streaming mode
   */
  protected abstract callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    settings?: ChatGPT_MDSettings,
    provider?: AiProvider,
    toolService?: ToolService
  ): Promise<any>;

  /**
   * Infer a title from messages - each service can override this if needed,
   * but this provides a standard implementation
   */
  protected inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any): Promise<string> => {
    try {
      if (messages.length < 2) {
        this.notificationService.showWarning("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon (:), back slash (\\), forward slash (/), asterisk (*), question mark (?), double quote ("), less than (<), greater than (>), or pipe (|) as these are invalid in file names. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      // Get the default config for this service
      const defaultConfig = this.getDefaultConfig();

      // Ensure all settings are applied
      const config = {
        ...defaultConfig,
        ...settings,
      };

      // If model is not set in settings, use the default model
      if (!config.model) {
        console.log("[ChatGPT MD] Model not set for title inference, using default model");
        config.model = defaultConfig.model;
      }

      // Ensure we have a URL
      if (!config.url) {
        console.log("[ChatGPT MD] URL not set for title inference, using default URL");
        config.url = defaultConfig.url;
      }

      console.log("[ChatGPT MD] Inferring title with model:", config.model);

      try {
        // Use a separate try/catch block for the API call to handle errors without returning them to the chat
        // Call the regular non-streaming API (which uses AI SDK)
        const response = await this.callNonStreamingAPI(
          apiKey,
          [{ role: ROLE_USER, content: prompt }],
          config,
          settings
        );
        return response.fullString || response;
      } catch (apiError) {
        // Log the error but don't return it to the chat
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
   * Get the full API endpoint URL
   */
  protected getApiEndpoint(config: Record<string, any>): string {
    return `${config.url}${API_ENDPOINTS[this.serviceType as keyof typeof API_ENDPOINTS]}`;
  }

  /**
   * Extract model name by removing provider prefix
   * e.g., "openai@gpt-4" -> "gpt-4"
   */
  protected extractModelName(model: string): string {
    const atIndex = model.indexOf("@");
    return atIndex !== -1 ? model.slice(atIndex + 1) : model;
  }

  /**
   * Add plugin system message to messages array
   * This ensures the LLM understands the Obsidian context
   * Each service can specify its preferred role for system messages
   */
  protected addPluginSystemMessage(messages: Message[], settings: ChatGPT_MDSettings): Message[] {
    // If service supports system field (like Anthropic), don't add to messages
    if (this.supportsSystemField()) {
      return messages;
    }

    const pluginSystemMessage: Message = {
      role: this.getSystemMessageRole(),
      content: settings.pluginSystemMessage,
    };

    // Add the plugin system message at the beginning
    return [pluginSystemMessage, ...messages];
  }

  /**
   * Process system commands for services that don't support system field
   */
  protected processSystemCommands(messages: Message[], systemCommands: string[] | null | undefined): Message[] {
    if (!systemCommands || systemCommands.length === 0) {
      return messages;
    }

    // If service supports system field, don't add to messages (handled in payload)
    if (this.supportsSystemField()) {
      return messages;
    }

    // Add system commands to the beginning of the messages
    const systemMessages = systemCommands.map((command) => ({
      role: this.getSystemMessageRole(),
      content: command,
    }));

    return [...systemMessages, ...messages];
  }

  /**
   * Handle API errors for both streaming and non-streaming calls
   */
  protected handleApiCallError(
    err: any,
    config: Record<string, any>,
    isTitleInference: boolean | string | undefined = false
  ): any {
    console.error(`[ChatGPT MD] ${this.serviceType} API error:`, err);

    // Convert string or any other truthy value to boolean
    const shouldThrow = Boolean(isTitleInference);

    if (shouldThrow) {
      // For title inference, just throw the error to be caught by the caller
      throw err;
    }

    // For regular chat, return the error message
    return this.errorService.handleApiError(err, this.serviceType, {
      returnForChat: true,
      showNotification: true,
      context: { model: config.model, url: config.url },
    });
  }

  /**
   * Common AI SDK generateText implementation
   * Can be used by any service that has a provider
   */
  protected async callAiSdkGenerateText(
    model: LanguageModel,
    modelName: string,
    messages: Message[],
    tools?: Record<string, any>,
    toolService?: ToolService,
    settings?: ChatGPT_MDSettings
  ): Promise<{ fullString: string; model: string }> {
    // Convert messages to AI SDK format
    const aiSdkMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    // Prepare request
    const request: any = {
      model,
      messages: aiSdkMessages,
    };

    // Add tools if provided AND model supports them (check settings)
    const toolsAvailable = tools && Object.keys(tools).length > 0;
    const shouldUseTool = toolsAvailable && settings && this.modelSupportsTools(modelName, settings);

    if (shouldUseTool) {
      request.tools = tools;
    }

    // Call AI SDK generateText
    let response;
    try {
      response = await generateText(request);
    } catch (err: any) {
      console.log(`[ChatGPT MD] Error during generateText:`, err);
      // Don't retry - cache is the only source of truth
      throw err;
    }

    // Handle tool calls if present
    if (toolService && response.toolCalls && response.toolCalls.length > 0) {
      // Request user approval and execute tool calls
      const toolResults = await toolService.handleToolCalls(response.toolCalls, modelName);

      // Process results (filter, approve, get context)
      const { contextMessages } = await toolService.processToolResults(response.toolCalls, toolResults, modelName);

      // Build continuation messages
      const updatedMessages = [...aiSdkMessages];

      if (response.text?.trim()) {
        updatedMessages.push({ role: "assistant", content: response.text });
      }

      updatedMessages.push(...contextMessages);

      // Call generateText again for final response (no tools - just answer)
      const continuationResponse = await generateText({
        model,
        messages: updatedMessages,
      });

      return { fullString: continuationResponse.text, model: modelName };
    }

    // No tool calls - return directly
    return { fullString: response.text, model: modelName };
  }

  /**
   * Common AI SDK streamText implementation
   * Can be used by any service that has a provider
   */
  protected async callAiSdkStreamText(
    model: LanguageModel,
    modelName: string,
    messages: Message[],
    config: Record<string, any>,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean,
    tools?: Record<string, any>,
    toolService?: ToolService,
    settings?: ChatGPT_MDSettings
  ): Promise<StreamingResponse> {
    // Convert messages to AI SDK format
    const aiSdkMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    // Insert assistant header
    const cursorPositions = this.apiResponseParser.insertAssistantHeader(editor, headingPrefix, modelName);

    // Setup abort controller
    const abortController = new AbortController();
    this.apiService.setAbortController(abortController);

    // Initialize streaming handler
    const initialCursor = setAtCursor ? cursorPositions.initialCursor : cursorPositions.newCursor;
    let handler: StreamingHandler | undefined;

    try {
      handler = new StreamingHandler(editor, initialCursor, setAtCursor);
      handler.startBuffering();

      // Prepare request
      const request: any = {
        model,
        messages: aiSdkMessages,
        abortSignal: abortController.signal,
      };

      // Add tools if provided AND model supports them (check settings)
      const toolsAvailable = tools && Object.keys(tools).length > 0;
      const shouldUseTool = toolsAvailable && settings && this.modelSupportsTools(modelName, settings);

      if (shouldUseTool) {
        request.tools = tools;
      }

      let fullText = "";
      let result: any;
      let finalResult: any;

      // Helper function to consume a stream
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

      // Call AI SDK streamText - if tools were used and it fails, retry without tools
      try {
        result = streamText(request);

        // Consume stream
        fullText = await consumeStream(result);
        handler.stopBuffering();

        // Try to get final result
        finalResult = await result;

        // Try to await finishReason if it's a promise (it might contain errors)
        let actualFinishReason = finalResult?.finishReason;
        if (actualFinishReason && typeof actualFinishReason.then === "function") {
          try {
            actualFinishReason = await actualFinishReason;
          } catch (finishErr: any) {
            // Let caller handle the error
            throw finishErr;
          }
        }
      } catch (err: any) {
        handler?.stopBuffering();
        throw err;
      }

      // Handle tool calls after streaming completes
      if (toolService && finalResult && finalResult.toolCalls) {
        const toolCalls = await finalResult.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          // Show indicator
          const toolNotice = "_[Tool approval required...]_\n";
          const indicatorCursor = handler.getCursor();
          editor.replaceRange(toolNotice, indicatorCursor);
          handler.updateCursorAfterInsert(toolNotice, indicatorCursor);

          // Execute and process tool calls
          const toolResults = await toolService.handleToolCalls(toolCalls, modelName);
          const { contextMessages } = await toolService.processToolResults(toolCalls, toolResults, modelName);

          // Clear indicator
          const toolCursor = handler.getCursor();
          editor.replaceRange("", { line: toolCursor.line - 1, ch: 0 }, toolCursor);
          handler.setCursor({ line: toolCursor.line - 1, ch: 0 });

          // Build continuation messages
          const updatedMessages = [...aiSdkMessages];
          updatedMessages.push({ role: "assistant", content: fullText });
          updatedMessages.push(...contextMessages);

          // Continue streaming
          const continuationResult = streamText({
            model,
            messages: updatedMessages,
          });

          // Reset handler for continuation
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

      // Move visible cursor to final position
      const finalCursor = handler.getCursor();
      if (!setAtCursor) {
        editor.setCursor(finalCursor);
      }

      // Return the streaming response
      return {
        fullString: fullText,
        mode: "streaming",
        wasAborted: this.apiService.wasAborted(),
      };
    } catch (err) {
      // Handle unexpected errors
      const errorMessage = `Error: ${err}`;

      // Write error to editor at the appropriate cursor position
      const errorCursor = handler?.getCursor() || initialCursor;
      editor.replaceRange(errorMessage, errorCursor);

      return { fullString: errorMessage, mode: "streaming" };
    }
  }
}

export interface OpenAiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface OllamaModel {
  name: string;
}

/**
 * Determine the AI provider from a model string
 * Model prefixes (e.g., "openai@gpt-4") are the canonical way to specify providers
 */
export const aiProviderFromUrl = (url?: string, model?: string): string | undefined => {
  if (!model) {
    return undefined;
  }

  // Canonical: Check explicit provider prefixes
  const prefixMap: [string, string][] = [
    ["openai@", AI_SERVICE_OPENAI],
    ["anthropic@", AI_SERVICE_ANTHROPIC],
    ["gemini@", AI_SERVICE_GEMINI],
    ["ollama@", AI_SERVICE_OLLAMA],
    ["lmstudio@", AI_SERVICE_LMSTUDIO],
    ["openrouter@", AI_SERVICE_OPENROUTER],
    ["local@", AI_SERVICE_OLLAMA], // backward compatibility
  ];

  for (const [prefix, service] of prefixMap) {
    if (model.startsWith(prefix)) {
      return service;
    }
  }

  // Legacy: Infer from model name patterns (backward compatibility)
  const modelLower = model.toLowerCase();

  if (modelLower.includes("claude")) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (modelLower.includes("gemini")) {
    return AI_SERVICE_GEMINI;
  }
  if (
    modelLower.includes("gpt") ||
    modelLower.startsWith("o1") ||
    modelLower.startsWith("o3") ||
    modelLower.startsWith("o4")
  ) {
    return AI_SERVICE_OPENAI;
  }

  // Default to OpenAI for unrecognized models (most common case)
  return AI_SERVICE_OPENAI;
};

/**
 * Determine AI provider based on available API keys
 */
export const aiProviderFromKeys = (config: Record<string, any>): string | null => {
  const hasOpenRouterKey = isValidApiKey(config.openrouterApiKey);
  const hasOpenAIKey = isValidApiKey(config.apiKey);
  const hasAnthropicKey = isValidApiKey(config.anthropicApiKey);
  const hasGeminiKey = isValidApiKey(config.geminiApiKey);

  // Priority order: OpenAI > Anthropic > Gemini > OpenRouter
  if (hasOpenAIKey) {
    return AI_SERVICE_OPENAI;
  } else if (hasAnthropicKey) {
    return AI_SERVICE_ANTHROPIC;
  } else if (hasGeminiKey) {
    return AI_SERVICE_GEMINI;
  } else if (hasOpenRouterKey) {
    return AI_SERVICE_OPENROUTER;
  }

  return null;
};
