import { MarkdownView } from "obsidian";
import { Message } from "src/Models/Message";
import { NEWLINE, ROLE_USER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "./EditorService";
import { NotificationService } from "./NotificationService";
import { ApiClient } from "./ApiClient";

/**
 * TitleInferenceService handles title inference logic and validation
 * Separated from BaseAiService to follow Single Responsibility Principle
 */
export class TitleInferenceService {
  private readonly notificationService: NotificationService;
  private readonly apiClient: ApiClient;

  constructor(notificationService: NotificationService, apiClient: ApiClient) {
    this.notificationService = notificationService;
    this.apiClient = apiClient;
  }

  /**
   * Infer a title from messages
   */
  async inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService,
    serviceType: string,
    getDefaultConfig: () => Record<string, any>,
    getApiKeyFromSettings: (settings: ChatGPT_MDSettings) => string,
    createPayload: (config: Record<string, any>, messages: Message[]) => Record<string, any>,
    supportsSystemField: boolean,
    systemMessageRole: string
  ): Promise<string> {
    try {
      if (!view.file) {
        throw new Error("No active file found");
      }

      // Get the API key from settings
      const apiKey = getApiKeyFromSettings(settings);

      // Infer the title
      const titleResponse = await this.inferTitleFromMessages(
        apiKey,
        messages,
        settings,
        serviceType,
        getDefaultConfig,
        createPayload,
        supportsSystemField,
        systemMessageRole
      );

      // Extract the title string - handle both string and object responses
      let titleStr = "";

      if (typeof titleResponse === "string") {
        titleStr = titleResponse;
      } else if (titleResponse && typeof titleResponse === "object") {
        // Type assertion for the response object
        const responseObj = titleResponse as { fullString?: string };
        titleStr = responseObj.fullString || "";
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
   * Infer a title from messages - core logic
   */
  private async inferTitleFromMessages(
    apiKey: string,
    messages: string[],
    settings: any,
    serviceType: string,
    getDefaultConfig: () => Record<string, any>,
    createPayload: (config: Record<string, any>, messages: Message[]) => Record<string, any>,
    supportsSystemField: boolean,
    systemMessageRole: string
  ): Promise<string> {
    try {
      if (messages.length < 2) {
        this.notificationService.showWarning("Not enough messages to infer title. Minimum 2 messages.");
        return "";
      }

      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon (:), back slash (\\), forward slash (/), asterisk (*), question mark (?), double quote ("), less than (<), greater than (>), or pipe (|) as these are invalid in file names. Just return the title. Write the title in ${settings.inferTitleLanguage}. \nMessages:${NEWLINE}${JSON.stringify(
        messages
      )}`;

      // Get the default config for this service
      const defaultConfig = getDefaultConfig();

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
        // For title inference, we call the API directly without the plugin system message
        return await this.callNonStreamingAPIForTitleInference(
          apiKey,
          [{ role: ROLE_USER, content: prompt }],
          config,
          serviceType,
          createPayload,
          supportsSystemField,
          systemMessageRole
        );
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
  }

  /**
   * Call non-streaming API specifically for title inference (without plugin system message)
   */
  private async callNonStreamingAPIForTitleInference(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    serviceType: string,
    createPayload: (config: Record<string, any>, messages: Message[]) => Record<string, any>,
    supportsSystemField: boolean,
    systemMessageRole: string
  ): Promise<any> {
    try {
      config.stream = false;
      
      // Prepare API call with skip plugin system message = true
      const { messages: finalMessages, headers } = this.apiClient.prepareApiCall(
        apiKey,
        messages,
        config,
        serviceType,
        supportsSystemField,
        systemMessageRole,
        true // Skip plugin system message
      );

      // Create payload
      const payload = createPayload(config, finalMessages);

      const response = await this.apiClient.makeNonStreamingRequest(
        this.apiClient.getApiEndpoint(config, serviceType),
        payload,
        headers,
        serviceType
      );

      // Return simple object with response and model
      return response;
    } catch (err) {
      throw err; // Re-throw for title inference error handling
    }
  }

  /**
   * Show a notification when title inference fails
   */
  private showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }
}