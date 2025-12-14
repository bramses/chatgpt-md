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

  // Abstract property that subclasses must implement to specify their provider
  protected abstract provider: AiProvider;

  // Abstract property that subclasses must implement to specify their service type
  protected abstract serviceType: string;

  // Abstract property to specify the preferred role for system messages
  protected abstract getSystemMessageRole(): string;

  // Abstract property to specify if the service supports system field in payload
  protected abstract supportsSystemField(): boolean;

  constructor(errorService?: ErrorService, notificationService?: NotificationService) {
    this.notificationService = notificationService ?? new NotificationService();
    this.errorService = errorService ?? new ErrorService(this.notificationService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);
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
    toolService?: ToolService
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

    // Add tools if provided
    if (tools && Object.keys(tools).length > 0) {
      request.tools = tools;
    }

    // Call AI SDK generateText
    const response = await generateText(request);

    // Handle tool calls if present
    if (toolService && response.toolCalls && response.toolCalls.length > 0) {
      console.log(`[ChatGPT MD] AI requested ${response.toolCalls.length} tool call(s)`);

      // Request user approval and execute tool calls
      const toolResults = await toolService.handleToolCalls(response.toolCalls);

      console.log('[ChatGPT MD] Tool results:', toolResults);

      // Handle vault_search results approval - filter results before sending to LLM
      const filteredToolResults = [];
      for (const tr of toolResults) {
        // Check if this is a vault_search result that needs approval
        const correspondingToolCall = response.toolCalls.find((tc: any) => {
          const tcId = tc.toolCallId || tc.id || 'unknown';
          return tcId === tr.toolCallId;
        });

        if (correspondingToolCall && correspondingToolCall.toolName === 'vault_search' && Array.isArray(tr.result)) {
          // Request approval for search results before showing to LLM
          const query = (correspondingToolCall.input as any)?.query || 'unknown';
          const approvedResults = await toolService.requestSearchResultsApproval(
            query,
            tr.result
          );

          filteredToolResults.push({
            ...tr,
            result: approvedResults,
          });
        } else {
          // Keep other tool results as-is
          filteredToolResults.push(tr);
        }
      }

      // Format tool results for the AI to understand
      const formattedResults = filteredToolResults
        .map((tr: any) => {
          const result = tr.result;
          if (Array.isArray(result)) {
            // Format array results as JSON (paths are already formatted as markdown links from tool)
            return `Tool "${tr.toolCallId}": ${JSON.stringify(result, null, 2)}`;
          } else if (typeof result === 'object' && result !== null) {
            return `Tool "${tr.toolCallId}": ${JSON.stringify(result, null, 2)}`;
          } else {
            return `Tool "${tr.toolCallId}": ${String(result)}`;
          }
        })
        .join('\n\n');

      // Add tool results to messages and call generateText again to get final response
      const updatedMessages = [...aiSdkMessages];

      // Add assistant message with the initial response (may be empty)
      const assistantContent = response.text && response.text.trim() ? response.text : '';
      if (assistantContent) {
        updatedMessages.push({
          role: 'assistant',
          content: assistantContent,
        });
      }

      // Add tool results as user message
      updatedMessages.push({
        role: 'user',
        content: `Tool execution results:\n\n${formattedResults}`,
      });

      // Call generateText again with tool results
      // Include tools in the continuation so the AI can make more tool calls (e.g., file_read after vault_search)
      const continuationRequest: any = {
        model,
        messages: updatedMessages,
      };

      // Include tools if they exist (for chained tool calls like vault_search -> file_read)
      if (tools && Object.keys(tools).length > 0) {
        continuationRequest.tools = tools;
      }

      const continuationResponse = await generateText(continuationRequest);

      console.log('[ChatGPT MD] Continuation response after tool execution:', continuationResponse.text);
      console.log('[ChatGPT MD] Continuation tool calls:', continuationResponse.toolCalls?.length);

      // Handle any additional tool calls from the continuation
      if (toolService && continuationResponse.toolCalls && continuationResponse.toolCalls.length > 0) {
        console.log(`[ChatGPT MD] AI made additional tool call(s) after tool results: ${continuationResponse.toolCalls.length}`);

        // Recursively handle any additional tool calls
        const additionalToolResults = await toolService.handleToolCalls(continuationResponse.toolCalls);

        console.log('[ChatGPT MD] Additional tool results:', additionalToolResults);

        // Filter results based on tool type (same privacy filtering as initial results)
        const filteredAdditionalResults = [];
        for (const tr of additionalToolResults) {
          // Check if this is a vault_search result that needs approval
          const correspondingToolCall = continuationResponse.toolCalls.find((tc: any) => {
            const tcId = tc.toolCallId || tc.id || 'unknown';
            return tcId === tr.toolCallId;
          });

          if (correspondingToolCall && correspondingToolCall.toolName === 'vault_search' && Array.isArray(tr.result)) {
            // Request approval for search results before showing to LLM
            const query = (correspondingToolCall.input as any)?.query || 'unknown';
            const approvedResults = await toolService.requestSearchResultsApproval(
              query,
              tr.result
            );

            filteredAdditionalResults.push({
              ...tr,
              result: approvedResults,
            });
          } else {
            // Keep other tool results as-is
            filteredAdditionalResults.push(tr);
          }
        }

        // Format the additional tool results
        const additionalFormattedResults = filteredAdditionalResults
          .map((tr: any) => {
            const result = tr.result;
            if (Array.isArray(result)) {
              return `Tool "${tr.toolCallId}": ${JSON.stringify(result, null, 2)}`;
            } else if (typeof result === 'object' && result !== null) {
              return `Tool "${tr.toolCallId}": ${JSON.stringify(result, null, 2)}`;
            } else {
              return `Tool "${tr.toolCallId}": ${String(result)}`;
            }
          })
          .join('\n\n');

        // Add the continuation response and additional tool results to messages
        const finalMessages = [...updatedMessages];

        const continuationContent = continuationResponse.text && continuationResponse.text.trim() ? continuationResponse.text : '';
        if (continuationContent) {
          finalMessages.push({
            role: 'assistant',
            content: continuationContent,
          });
        }

        finalMessages.push({
          role: 'user',
          content: `Additional tool execution results:\n\n${additionalFormattedResults}`,
        });

        // Call generateText one more time to get the final response
        const finalRequest: any = {
          model,
          messages: finalMessages,
          // Don't include tools in the final call to prevent infinite loops
        };

        const finalResponse = await generateText(finalRequest);
        const finalText = typeof finalResponse.text === 'string' ? finalResponse.text : String(finalResponse.text || '');
        return { fullString: finalText, model: modelName };
      }

      // No additional tool calls, return the continuation response
      const finalText = typeof continuationResponse.text === 'string' ? continuationResponse.text : String(continuationResponse.text || '');
      return { fullString: finalText, model: modelName };
    }

    // Return in expected format
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
    toolService?: ToolService
  ): Promise<StreamingResponse> {
    try {
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

      // Prepare request
      const request: any = {
        model,
        messages: aiSdkMessages,
        abortSignal: abortController.signal,
      };

      // Add tools if provided
      if (tools && Object.keys(tools).length > 0) {
        request.tools = tools;
      }

      // Call AI SDK streamText
      const result = streamText(request);
      const { textStream } = result;

      let fullText = "";
      let currentCursor = setAtCursor ? cursorPositions.initialCursor : cursorPositions.newCursor;

      // Iterate over the text stream
      for await (const textPart of textStream) {
        // Check if streaming was aborted
        if (this.apiService.wasAborted()) {
          break;
        }

        fullText += textPart;

        // Update the editor with the new text
        if (setAtCursor) {
          editor.replaceSelection(textPart);
        } else {
          // Insert at tracked cursor position
          editor.replaceRange(textPart, currentCursor);

          // Update cursor position using Obsidian's offset API
          // This correctly handles multi-line content
          const currentOffset = editor.posToOffset(currentCursor);
          const newOffset = currentOffset + textPart.length;
          currentCursor = editor.offsetToPos(newOffset);
        }
      }

      // Handle tool calls after streaming completes
      const finalResult = await result;
      if (toolService && finalResult.toolCalls) {
        const toolCalls = await finalResult.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          console.log(`[ChatGPT MD] AI requested ${toolCalls.length} tool call(s)`);

          // Show tool request indicator in editor
          const toolNotice = "\n\n_[Tool approval required - requesting approval...]_\n";
          editor.replaceRange(toolNotice, currentCursor);
          currentCursor = editor.offsetToPos(editor.posToOffset(currentCursor) + toolNotice.length);

          // Request user approval and execute tool calls
          const toolResults = await toolService.handleToolCalls(toolCalls);

          // Handle vault_search results approval - filter results before sending to LLM
          const filteredToolResults = [];
          for (const tr of toolResults) {
            // Check if this is a vault_search result that needs approval
            const correspondingToolCall = toolCalls.find((tc: any) => {
              const tcId = tc.toolCallId || tc.id || 'unknown';
              return tcId === tr.toolCallId;
            });

            if (correspondingToolCall && correspondingToolCall.toolName === 'vault_search' && Array.isArray(tr.result)) {
              // Request approval for search results before showing to LLM
              const query = (correspondingToolCall.input as any)?.query || 'unknown';
              const approvedResults = await toolService.requestSearchResultsApproval(
                query,
                tr.result
              );

              filteredToolResults.push({
                ...tr,
                result: approvedResults,
              });
            } else {
              // Keep other tool results as-is
              filteredToolResults.push(tr);
            }
          }

          // Clear the notice and add tool results to editor
          editor.replaceRange('', { line: currentCursor.line - 1, ch: 0 }, currentCursor);
          currentCursor = { line: currentCursor.line - 1, ch: 0 };

          // Add tool results summary to editor
          const resultsSummary = `\n\n_Tool results:_\n\`\`\`\n${JSON.stringify(filteredToolResults, null, 2)}\n\`\`\`\n\n`;
          editor.replaceRange(resultsSummary, currentCursor);
          currentCursor = editor.offsetToPos(editor.posToOffset(currentCursor) + resultsSummary.length);

          // Call streamText again with tool results included in messages
          const updatedMessages = [...aiSdkMessages];
          updatedMessages.push({
            role: 'assistant',
            content: fullText,
          });
          updatedMessages.push({
            role: 'user',
            content: `Tool execution results: ${JSON.stringify(filteredToolResults)}`,
          });

          // Call streamText again for continuation
          const continuationRequest: any = {
            model,
            messages: updatedMessages,
          };
          if (tools && Object.keys(tools).length > 0) {
            continuationRequest.tools = tools;
          }

          // Continue streaming the response
          const continuationResult = streamText(continuationRequest);
          const continuationTextStream = continuationResult.textStream;

          for await (const textPart of continuationTextStream) {
            if (this.apiService.wasAborted()) {
              break;
            }
            fullText += textPart;
            editor.replaceRange(textPart, currentCursor);
            const currentOffset = editor.posToOffset(currentCursor);
            const newOffset = currentOffset + textPart.length;
            currentCursor = editor.offsetToPos(newOffset);
          }

          // Check if there were additional tool calls in the continuation
          const continuationFinalResult = await continuationResult;
          const additionalToolCalls = continuationFinalResult.toolCalls ? await Promise.resolve(continuationFinalResult.toolCalls) : [];
          if (toolService && additionalToolCalls && additionalToolCalls.length > 0) {
            console.log(`[ChatGPT MD] AI made additional tool call(s) in continuation: ${additionalToolCalls.length}`);

            // Handle the additional tool calls
            const additionalToolResults = await toolService.handleToolCalls(additionalToolCalls);

            // Filter results based on tool type (same privacy filtering as initial results)
            const filteredAdditionalResults = [];
            for (const tr of additionalToolResults) {
              // Check if this is a vault_search result that needs approval
              const correspondingToolCall = additionalToolCalls.find((tc: any) => {
                const tcId = tc.toolCallId || tc.id || 'unknown';
                return tcId === tr.toolCallId;
              });

              if (correspondingToolCall && correspondingToolCall.toolName === 'vault_search' && Array.isArray(tr.result)) {
                // Request approval for search results before showing to LLM
                const query = (correspondingToolCall.input as any)?.query || 'unknown';
                const approvedResults = await toolService.requestSearchResultsApproval(
                  query,
                  tr.result
                );

                filteredAdditionalResults.push({
                  ...tr,
                  result: approvedResults,
                });
              } else {
                // Keep other tool results as-is
                filteredAdditionalResults.push(tr);
              }
            }

            // Add separator and tool results to editor
            editor.replaceRange("\n\n_[Additional tool results:]_\n", currentCursor);
            currentCursor = editor.offsetToPos(editor.posToOffset(currentCursor) + "\n\n_[Additional tool results:]_\n".length);

            // Format and display the additional tool results
            const additionalFormattedResults = filteredAdditionalResults
              .map((tr: any) => {
                const result = tr.result;
                if (Array.isArray(result)) {
                  return JSON.stringify(result, null, 2);
                } else if (typeof result === 'object' && result !== null) {
                  return JSON.stringify(result, null, 2);
                } else {
                  return String(result);
                }
              })
              .join('\n\n');

            editor.replaceRange(additionalFormattedResults + "\n\n", currentCursor);
            currentCursor = editor.offsetToPos(editor.posToOffset(currentCursor) + additionalFormattedResults.length + "\n\n".length);
          }
        }
      }

      // Move visible cursor to final position
      if (!setAtCursor) {
        editor.setCursor(currentCursor);
      }

      // Return the streaming response
      return {
        fullString: fullText,
        mode: "streaming",
        wasAborted: this.apiService.wasAborted(),
      };
    } catch (err) {
      // Handle errors
      const errorMessage = `Error: ${err}`;
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
 * Determine the AI provider from a URL or model
 */
export const aiProviderFromUrl = (url?: string, model?: string): string | undefined => {
  // Check model first for service prefixes
  if (model?.startsWith("openai@")) {
    return AI_SERVICE_OPENAI;
  }
  if (model?.includes(AI_SERVICE_OPENROUTER)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (model?.startsWith("lmstudio@")) {
    return AI_SERVICE_LMSTUDIO;
  }
  if (model?.startsWith("anthropic@")) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (model?.startsWith("gemini@")) {
    return AI_SERVICE_GEMINI;
  }
  if (model?.startsWith("ollama@")) {
    return AI_SERVICE_OLLAMA;
  }
  if (model?.startsWith("local@")) {
    // Backward compatibility: local@ prefix points to Ollama
    return AI_SERVICE_OLLAMA;
  }
  if (model?.includes("claude")) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (model?.includes("gemini")) {
    return AI_SERVICE_GEMINI;
  }
  if (model?.includes("local")) {
    // Check URL to distinguish between Ollama and LM Studio for legacy "local" models
    if (url?.includes("1234")) {
      return AI_SERVICE_LMSTUDIO;
    }
    return AI_SERVICE_OLLAMA;
  }

  // Check for common OpenAI model patterns (backward compatibility)
  if (model?.includes("gpt") || model?.includes("o1") || model?.includes("o3") || model?.includes("o4")) {
    return AI_SERVICE_OPENAI;
  }

  // Then check URL patterns
  // Define URL patterns
  const OPENROUTER_URL_PATTERN = "openrouter";
  const ANTHROPIC_URL_PATTERN = "anthropic";
  const GEMINI_URL_PATTERN = "generativelanguage.googleapis.com";
  const LOCAL_URL_PATTERNS = ["localhost", "127.0.0.1"];
  const LMSTUDIO_URL_PATTERN = "1234"; // LM Studio default port

  if (url?.includes(OPENROUTER_URL_PATTERN)) {
    return AI_SERVICE_OPENROUTER;
  }
  if (url?.includes(ANTHROPIC_URL_PATTERN)) {
    return AI_SERVICE_ANTHROPIC;
  }
  if (url?.includes(GEMINI_URL_PATTERN)) {
    return AI_SERVICE_GEMINI;
  }
  if (url?.includes(LMSTUDIO_URL_PATTERN)) {
    return AI_SERVICE_LMSTUDIO;
  }
  if (LOCAL_URL_PATTERNS.some((pattern) => url?.includes(pattern))) {
    return AI_SERVICE_OLLAMA;
  }

  // Default to OpenAI for models without explicit service identification
  // This maintains backward compatibility for existing configurations
  if (model && !url) {
    return AI_SERVICE_OPENAI;
  }

  // Return undefined if no provider can be determined
  return undefined;
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
