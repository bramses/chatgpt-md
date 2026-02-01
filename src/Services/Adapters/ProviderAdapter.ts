import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Union type for all supported AI providers
 */
export type ProviderType = "openai" | "anthropic" | "ollama" | "openrouter" | "gemini" | "lmstudio" | "copilot";

/**
 * Unified configuration interface for all AI providers
 * Replaces the 6 separate config interfaces (OpenAIConfig, AnthropicConfig, etc.)
 */
export interface AiProviderConfig {
  // Common fields
  provider: ProviderType;
  model: string;
  maxTokens: number;
  temperature: number;
  stream: boolean;
  url: string;
  title: string;
  system_commands: string[] | null;
  tags: string[] | null;

  // Optional fields (not all providers use these)
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  apiKey?: string;
}

/**
 * Provider-specific model data from API responses
 */
export interface ProviderModelData {
  id: string;
  name?: string;
  [key: string]: any;
}

/**
 * Interface defining the contract for AI provider adapters
 * Each adapter encapsulates provider-specific logic and differences
 */
export interface ProviderAdapter {
  /**
   * Unique identifier for this provider
   */
  readonly type: ProviderType;

  /**
   * Human-readable display name
   */
  readonly displayName: string;

  /**
   * Default base URL for this provider's API
   */
  getDefaultBaseUrl(): string;

  /**
   * Create authentication headers for API requests
   */
  getAuthHeaders(apiKey: string): Record<string, string>;

  /**
   * Fetch available models from this provider
   * @param url - Base URL for API (may be custom from settings)
   * @param apiKey - API key for authentication (if required)
   * @param settings - Plugin settings for tool support detection
   * @returns Array of model IDs with provider prefix (e.g., "openai@gpt-4")
   */
  fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]>;

  /**
   * The role to use for system messages in the messages array
   * OpenAI uses 'developer', most others use 'system'
   */
  getSystemMessageRole(): "system" | "developer";

  /**
   * Whether this provider supports a 'system' field in the API payload
   * Anthropic: true (has dedicated system field)
   * OpenAI/Ollama/etc: false (system is part of messages array)
   */
  supportsSystemField(): boolean;

  /**
   * Whether this provider supports tool calling (function calling)
   */
  supportsToolCalling(): boolean;

  /**
   * Whether this provider requires an API key
   * Ollama and LM Studio: false
   * Others: true
   */
  requiresApiKey(): boolean;

  /**
   * Extract the model name from a full model ID with provider prefix
   * e.g., "openai@gpt-4" -> "gpt-4"
   * @param modelId - Model ID with or without provider prefix
   */
  extractModelName(modelId: string): string;
}
