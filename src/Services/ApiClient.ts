import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { API_ENDPOINTS, PLUGIN_SYSTEM_MESSAGE } from "src/Constants";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

/**
 * ApiClient handles HTTP requests, authentication, and API endpoint management
 * Separated from BaseAiService to follow Single Responsibility Principle
 */
export class ApiClient {
  private readonly apiService: ApiService;
  private readonly apiAuthService: ApiAuthService;
  private readonly errorService: ErrorService;
  private readonly notificationService: NotificationService;

  constructor(
    apiService: ApiService,
    apiAuthService: ApiAuthService,
    errorService: ErrorService,
    notificationService: NotificationService
  ) {
    this.apiService = apiService;
    this.apiAuthService = apiAuthService;
    this.errorService = errorService;
    this.notificationService = notificationService;
  }

  /**
   * Make a streaming API request
   */
  async makeStreamingRequest(
    endpoint: string,
    payload: Record<string, any>,
    headers: Record<string, string>,
    serviceType: string
  ) {
    return this.apiService.makeStreamingRequest(endpoint, payload, headers, serviceType);
  }

  /**
   * Make a non-streaming API request
   */
  async makeNonStreamingRequest(
    endpoint: string,
    payload: Record<string, any>,
    headers: Record<string, string>,
    serviceType: string
  ) {
    return this.apiService.makeNonStreamingRequest(endpoint, payload, headers, serviceType);
  }

  /**
   * Stop streaming
   */
  stopStreaming(): void {
    this.apiService.stopStreaming();
  }

  /**
   * Get the full API endpoint URL
   */
  getApiEndpoint(config: Record<string, any>, serviceType: string): string {
    return `${config.url}${API_ENDPOINTS[serviceType as keyof typeof API_ENDPOINTS]}`;
  }

  /**
   * Prepare API call with authentication and message processing
   */
  prepareApiCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    serviceType: string,
    supportsSystemField: boolean,
    systemMessageRole: string,
    skipPluginSystemMessage: boolean = false
  ) {
    // Validate API key
    this.apiAuthService.validateApiKey(apiKey, serviceType);

    // Add plugin system message to help LLM understand context (unless skipped)
    const finalMessages = skipPluginSystemMessage 
      ? messages 
      : this.addPluginSystemMessage(messages, supportsSystemField, systemMessageRole);

    // Create headers
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, serviceType);

    // Add plugin system message to payload if service supports system field and not skipped
    if (supportsSystemField && !skipPluginSystemMessage && !config.system) {
      config.system = PLUGIN_SYSTEM_MESSAGE;
    }

    return { messages: finalMessages, headers };
  }

  /**
   * Add plugin system message to messages array
   */
  private addPluginSystemMessage(
    messages: Message[], 
    supportsSystemField: boolean, 
    systemMessageRole: string
  ): Message[] {
    // If service supports system field (like Anthropic), don't add to messages
    if (supportsSystemField) {
      return messages;
    }

    const pluginSystemMessage: Message = {
      role: systemMessageRole,
      content: PLUGIN_SYSTEM_MESSAGE,
    };

    // Add the plugin system message at the beginning
    return [pluginSystemMessage, ...messages];
  }

  /**
   * Process system commands for services that don't support system field
   */
  processSystemCommands(
    messages: Message[], 
    systemCommands: string[] | null | undefined,
    supportsSystemField: boolean,
    systemMessageRole: string
  ): Message[] {
    if (!systemCommands || systemCommands.length === 0) {
      return messages;
    }

    // If service supports system field, don't add to messages (handled in payload)
    if (supportsSystemField) {
      return messages;
    }

    // Add system commands to the beginning of the messages
    const systemMessages = systemCommands.map((command) => ({
      role: systemMessageRole,
      content: command,
    }));

    return [...systemMessages, ...messages];
  }

  /**
   * Handle API errors
   */
  handleApiError(
    err: any,
    serviceType: string,
    config: Record<string, any>,
    isTitleInference: boolean = false
  ): any {
    console.error(`[ChatGPT MD] ${serviceType} API error:`, err);

    if (isTitleInference) {
      // For title inference, just throw the error to be caught by the caller
      throw err;
    }

    // For regular chat, return the error message
    return this.errorService.handleApiError(err, serviceType, {
      returnForChat: true,
      showNotification: true,
      context: { model: config.model, url: config.url },
    });
  }
}