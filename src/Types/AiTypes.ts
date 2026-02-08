import { Message } from "src/Models/Message";
import { Editor, MarkdownView } from "obsidian";
import { ToolService } from "src/Services/ToolService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "src/Services/EditorService";
import { LanguageModel } from "ai";

// AI SDK providers
import { OpenAIProvider } from "@ai-sdk/openai";
import { OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import { AnthropicProvider } from "@ai-sdk/anthropic";
import { GoogleGenerativeAIProvider } from "@ai-sdk/google";
import { OpenRouterProvider } from "@openrouter/ai-sdk-provider";

/**
 * AI Provider instance that can create language models
 */
export interface AiProviderInstance {
  (modelId: string): LanguageModel;
}

/**
 * Provider factory configuration
 */
export interface ProviderFactoryConfig {
  apiKey: string;
  baseURL: string;
  fetch?: typeof fetch;
  name: string; // Required for OpenAICompatible providers
}

/**
 * Provider factory function type
 * Note: This is a loose type to accommodate different provider factory signatures
 */
export type ProviderFactory = (config: ProviderFactoryConfig | unknown) => AiProviderInstance;

/**
 * Interface defining the contract for AI service implementations
 */
export interface IAiApiService {
  /**
   * Call the AI API with the given parameters
   */
  callAiAPI(
    messages: Message[],
    options: Record<string, unknown>,
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
   * @param url - Base URL for API
   * @param apiKey - API key for authentication (if required)
   * @param settings - Plugin settings
   * @param providerType - Optional provider type (for unified service)
   */
  fetchAvailableModels(
    url: string,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    providerType?: string
  ): Promise<string[]>;
}

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
 * Ollama model interface
 */
export interface OllamaModel {
  name: string;
}

/**
 * Type for streaming API response
 */
export type StreamingResponse = {
  fullString: string;
  mode: "streaming";
  wasAborted?: boolean;
};
