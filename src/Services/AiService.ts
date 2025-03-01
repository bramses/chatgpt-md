import { Message } from "src/Models/Message";
import { Editor, MarkdownView, Notice } from "obsidian";
import { StreamManager } from "src/stream";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { EditorService } from "src/Services/EditorService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { isValidApiKey } from "src/Utilities/SettingsUtils";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

/**
 * Interface defining the contract for AI service implementations
 */
export interface IAiApiService {
  /**
   * Call the AI API with the given parameters
   */
  callAIAPI(
    messages: Message[],
    options: any,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any>;

  /**
   * Infer a title from messages
   */
  inferTitle(view: MarkdownView, settings: any, messages: string[], editorService: EditorService): any;
}

/**
 * Base class for AI service implementations
 * Contains common functionality and defines abstract methods that must be implemented by subclasses
 */
export abstract class BaseAiService implements IAiApiService {
  constructor(protected streamManager: StreamManager) {}

  /**
   * Get the service type identifier
   */
  abstract getServiceType(): string;

  /**
   * Get the default configuration for this service
   */
  abstract getDefaultConfig(): any;

  /**
   * Create a payload for the API request
   */
  abstract createPayload(config: any, messages: Message[]): any;

  /**
   * Handle API errors
   */
  abstract handleAPIError(err: any, config: any, prefix: string): never;

  /**
   * Call the AI API with the given parameters
   */
  async callAIAPI(
    messages: Message[],
    options: any = {},
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string
  ): Promise<any> {
    const config = { ...this.getDefaultConfig(), ...options };

    return options.stream && editor
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor)
      : this.callNonStreamingAPI(apiKey, messages, config);
  }

  /**
   * Infer a title from messages
   */
  async inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<any> {
    if (!view.file) {
      throw new Error("No active file found");
    }

    console.log(`[${this.getServiceType()}] auto inferring title from messages`);

    // Get the appropriate API key from settings
    const apiKey = this.getApiKeyFromSettings(settings);

    const inferredTitle = await this.inferTitleFromMessages(apiKey, messages, settings);

    if (inferredTitle) {
      console.log(`[${this.getServiceType()}] automatically inferred title: ${inferredTitle}. Changing file name...`);
      await editorService.writeInferredTitle(view, inferredTitle);
    } else {
      this.showNoTitleInferredNotification();
    }
  }

  /**
   * Show a notification when title inference fails
   * This is a template method that should be overridden by subclasses
   */
  protected showNoTitleInferredNotification(): void {
    new Notice(`[${this.getServiceType()}] Could not infer title`, 5000);
  }

  /**
   * Get the appropriate API key from settings
   * This should be implemented by subclasses to return the correct API key
   */
  abstract getApiKeyFromSettings(settings: ChatGPT_MDSettings): string;

  /**
   * Call the streaming API
   */
  protected abstract callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: any,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean
  ): Promise<{ fullstr: string; mode: "streaming" }>;

  /**
   * Call the non-streaming API
   */
  protected abstract callNonStreamingAPI(apiKey: string | undefined, messages: Message[], config: any): Promise<any>;

  /**
   * Infer a title from messages
   */
  protected abstract inferTitleFromMessages(apiKey: string, messages: string[], settings: any): Promise<string>;

  /**
   * Validate that an API key is present and valid
   */
  protected validateApiKey(apiKey: string | undefined, serviceName: string): void {
    if (!isValidApiKey(apiKey)) {
      throw new Error(`${serviceName} API key is missing. Please add your ${serviceName} API key in the settings.`);
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
 * Factory function to create the appropriate AI service based on the service type
 * Note: This function is implemented in main.ts to avoid circular dependencies
 */
export const getAiApiService = (
  streamManager: StreamManager,
  serviceType: string,
  errorService?: ErrorService,
  notificationService?: NotificationService
): IAiApiService => {
  // This is a placeholder that will be replaced by the actual implementation in main.ts
  throw new Error("getAiApiService should be implemented in main.ts to avoid circular dependencies");
};

/**
 * Determines the AI provider from a URL and model
 */
export const aiProviderFromUrl = (url?: string, model?: string): string => {
  const trimmedUrl = (url ?? "").trim().toLowerCase();
  const trimmedModel = (model ?? "").trim().toLowerCase();

  if (trimmedModel.includes("@")) {
    const provider = trimmedModel.split("@")[0];
    if (["local", AI_SERVICE_OLLAMA].includes(provider)) return AI_SERVICE_OLLAMA;
    if (provider === AI_SERVICE_OPENAI) return AI_SERVICE_OPENAI;
    if (provider === AI_SERVICE_OPENROUTER) return AI_SERVICE_OPENROUTER;
  }

  if (trimmedUrl.startsWith("http://localhost") || trimmedUrl.startsWith("http://127.0.0.1")) {
    return AI_SERVICE_OLLAMA;
  }

  if (trimmedUrl.includes("openrouter.ai")) {
    return AI_SERVICE_OPENROUTER;
  }

  return AI_SERVICE_OPENAI;
};
