import { ChatGPT_MDSettings } from "src/Models/Config";
import { AiServiceConfig, AiServiceConfigFactory } from "./AiServiceConfigFactory";
import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { OpenRouterConfig } from "./OpenRouterService";
import { isValidApiKey } from "src/Utilities/SettingsUtils";
import { OpenAIConfig } from "./OpenAiService";
import { OllamaConfig } from "./OllamaService";

/**
 * Service for handling AI service configurations
 */
export class ConfigurationService {
  /**
   * Load configuration for the specified AI service type
   * @param settings The plugin settings
   * @param serviceType The type of AI service
   * @param overrides Optional configuration overrides
   * @returns The configuration for the specified service type
   */
  public static loadServiceConfig(
    settings: ChatGPT_MDSettings,
    serviceType: string,
    overrides: Partial<AiServiceConfig> = {}
  ): AiServiceConfig {
    // Get base configuration from factory
    const baseConfig = AiServiceConfigFactory.getDefaultConfig(serviceType);

    // Apply settings-based overrides
    const configWithSettings = this.applySettingsToConfig(baseConfig, settings, serviceType);

    // Apply explicit overrides (these take precedence)
    return { ...configWithSettings, ...overrides };
  }

  /**
   * Apply settings to a configuration
   * @param config The base configuration
   * @param settings The plugin settings
   * @param serviceType The type of AI service
   * @returns The configuration with settings applied
   */
  private static applySettingsToConfig(
    config: AiServiceConfig,
    settings: ChatGPT_MDSettings,
    serviceType: string
  ): AiServiceConfig {
    // Apply common settings
    const commonConfig = {
      ...config,
      system_commands: settings.system_commands || null,
    };

    // Apply service-specific settings
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        // OpenAI doesn't have an apiKey field in its config
        // The API key is passed separately when making API calls
        return commonConfig as OpenAIConfig;

      case AI_SERVICE_OPENROUTER:
        return {
          ...commonConfig,
          openrouterApiKey: settings.openrouterApiKey,
        } as OpenRouterConfig;

      case AI_SERVICE_OLLAMA:
        return commonConfig as OllamaConfig;

      default:
        return commonConfig;
    }
  }

  /**
   * Validate a configuration
   * @param config The configuration to validate
   * @param serviceType The type of AI service
   * @returns An object containing validation results
   */
  public static validateConfig(config: AiServiceConfig, serviceType: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate common fields
    if (!config.model) {
      errors.push("Model is required");
    }

    if (!config.url) {
      errors.push("URL is required");
    }

    // Validate service-specific fields
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        // For OpenAI, we validate the API key from settings, not from config
        break;

      case AI_SERVICE_OPENROUTER:
        const openRouterConfig = config as OpenRouterConfig;
        if (!isValidApiKey(openRouterConfig.openrouterApiKey)) {
          errors.push("Valid OpenRouter API key is required");
        }
        break;

      // Ollama doesn't require API key validation
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get the API key for a service from settings
   * @param settings The plugin settings
   * @param serviceType The type of AI service
   * @returns The API key for the specified service
   */
  public static getApiKeyForService(settings: ChatGPT_MDSettings, serviceType: string): string {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        return settings.apiKey;
      case AI_SERVICE_OPENROUTER:
        return settings.openrouterApiKey;
      default:
        return "";
    }
  }
}
