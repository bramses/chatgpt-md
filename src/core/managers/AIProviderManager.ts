import { Editor } from "obsidian";
import { Message } from "../../Models/Message";
import { SettingsManager } from "./SettingsManager";
import { OpenAIProviderAdapter } from "../adapters/OpenAIProviderAdapter";
import { AnthropicProviderAdapter } from "../adapters/AnthropicProviderAdapter";

// Core AI provider interfaces - simplified and focused
export interface AIConfig extends Record<string, any> {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  apiKey?: string;
  url?: string;
}

export interface AIResponse {
  content: string;
  model: string;
  wasAborted?: boolean;
}

export interface AIProvider {
  /**
   * Chat with the AI provider
   */
  chat(messages: Message[], config: AIConfig): Promise<AIResponse>;

  /**
   * Stream chat with the AI provider
   */
  streamChat(
    messages: Message[],
    config: AIConfig,
    editor: Editor,
    onProgress?: (text: string) => void
  ): Promise<AIResponse>;

  /**
   * Infer title from messages
   */
  inferTitle(messages: string[], config: AIConfig): Promise<string>;

  /**
   * Get available models for this provider
   */
  getAvailableModels?(config: AIConfig): Promise<string[]>;

  /**
   * Stop any ongoing streaming
   */
  stopStreaming?(): void;
}

/**
 * AIProviderManager - Simplified AI provider management
 *
 * Manages multiple AI providers through a simple, unified interface.
 * Removes the complex factory pattern in favor of direct provider registration.
 */
export class AIProviderManager {
  private providers = new Map<string, AIProvider>();
  private defaultProvider = "openai";

  constructor(private settingsManager: SettingsManager) {
    this.registerDefaultProviders();
  }

  /**
   * Register an AI provider
   */
  register(name: string, provider: AIProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * Get an AI provider by name
   */
  get(name: string): AIProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      console.warn(`[ChatGPT MD] Provider '${name}' not found, using default`);
      return this.providers.get(this.defaultProvider)!;
    }
    return provider;
  }

  /**
   * Get available provider names
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Set the default provider
   */
  setDefaultProvider(name: string): void {
    if (this.providers.has(name)) {
      this.defaultProvider = name;
    }
  }

  /**
   * Chat with the specified provider
   */
  async chat(providerName: string, messages: Message[], config: AIConfig): Promise<AIResponse> {
    const provider = this.get(providerName);
    return provider.chat(messages, this.enrichConfig(config));
  }

  /**
   * Stream chat with the specified provider
   */
  async streamChat(
    providerName: string,
    messages: Message[],
    config: AIConfig,
    editor: Editor,
    onProgress?: (text: string) => void
  ): Promise<AIResponse> {
    const provider = this.get(providerName);
    return provider.streamChat(messages, this.enrichConfig(config), editor, onProgress);
  }

  /**
   * Infer title using the specified provider
   */
  async inferTitle(providerName: string, messages: string[], config: AIConfig): Promise<string> {
    const provider = this.get(providerName);
    return provider.inferTitle(messages, this.enrichConfig(config));
  }

  /**
   * Stop streaming for all providers
   */
  stopAllStreaming(): void {
    for (const provider of this.providers.values()) {
      provider.stopStreaming?.();
    }
  }

  /**
   * Register default providers (these will be adapters to existing services)
   */
  private registerDefaultProviders(): void {
    // These will be implemented as adapters to existing AI services
    // For now, we'll register placeholders that will be replaced with actual adapters

    this.register("openai", new OpenAIProviderAdapter());
    this.register("anthropic", new AnthropicProviderAdapter());
    this.register("ollama", new PlaceholderProvider("ollama"));
    this.register("openrouter", new PlaceholderProvider("openrouter"));
    this.register("lmstudio", new PlaceholderProvider("lmstudio"));
  }

  /**
   * Enrich config with settings from SettingsManager
   */
  private enrichConfig(config: AIConfig): AIConfig {
    const settings = this.settingsManager.getSettings();

    return {
      // Defaults from settings
      temperature: 0.7,
      maxTokens: 2000,
      stream: settings.stream ?? true,

      // API URLs from settings
      urls: {
        openai: settings.openaiUrl,
        anthropic: settings.anthropicUrl,
        ollama: settings.ollamaUrl,
        openrouter: settings.openrouterUrl,
        lmstudio: settings.lmstudioUrl,
      },

      // API keys from settings
      apiKeys: {
        openai: settings.apiKey,
        anthropic: settings.anthropicApiKey,
        openrouter: settings.openrouterApiKey,
      },

      // Override with provided config
      ...config,
    };
  }
}

/**
 * Placeholder provider - to be replaced with actual adapters
 */
class PlaceholderProvider implements AIProvider {
  constructor(private name: string) {}

  async chat(messages: Message[], config: AIConfig): Promise<AIResponse> {
    throw new Error(`${this.name} provider not yet implemented in simplified architecture`);
  }

  async streamChat(
    messages: Message[],
    config: AIConfig,
    editor: Editor,
    onProgress?: (text: string) => void
  ): Promise<AIResponse> {
    throw new Error(`${this.name} provider streaming not yet implemented in simplified architecture`);
  }

  async inferTitle(messages: string[], config: AIConfig): Promise<string> {
    throw new Error(`${this.name} provider title inference not yet implemented in simplified architecture`);
  }

  stopStreaming(): void {
    // Placeholder - no-op
  }
}
