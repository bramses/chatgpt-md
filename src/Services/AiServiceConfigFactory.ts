import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { DEFAULT_OLLAMA_CONFIG, OllamaConfig } from "./OllamaService";
import { DEFAULT_OPENAI_CONFIG, OpenAIConfig } from "./OpenAiService";
import { DEFAULT_OPENROUTER_CONFIG, OpenRouterConfig } from "./OpenRouterService";

/**
 * Type representing all possible AI service configurations
 */
export type AiServiceConfig = OpenAIConfig | OpenRouterConfig | OllamaConfig;

/**
 * Factory class for creating AI service configurations
 */
export class AiServiceConfigFactory {
  /**
   * Create a configuration for the specified AI service type
   * @param serviceType The type of AI service
   * @param overrides Optional configuration overrides
   * @returns The configuration for the specified service type
   */
  public static createConfig(serviceType: string, overrides: Partial<AiServiceConfig> = {}): AiServiceConfig {
    let baseConfig: AiServiceConfig;

    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        baseConfig = { ...DEFAULT_OPENAI_CONFIG };
        break;
      case AI_SERVICE_OPENROUTER:
        baseConfig = { ...DEFAULT_OPENROUTER_CONFIG };
        break;
      case AI_SERVICE_OLLAMA:
        baseConfig = { ...DEFAULT_OLLAMA_CONFIG };
        break;
      default:
        throw new Error(`Unknown AI service type: ${serviceType}`);
    }

    // Apply overrides
    return { ...baseConfig, ...overrides };
  }

  /**
   * Get the default configuration for the specified AI service type
   * @param serviceType The type of AI service
   * @returns The default configuration for the specified service type
   */
  public static getDefaultConfig(serviceType: string): AiServiceConfig {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        return { ...DEFAULT_OPENAI_CONFIG };
      case AI_SERVICE_OPENROUTER:
        return { ...DEFAULT_OPENROUTER_CONFIG };
      case AI_SERVICE_OLLAMA:
        return { ...DEFAULT_OLLAMA_CONFIG };
      default:
        throw new Error(`Unknown AI service type: ${serviceType}`);
    }
  }

  /**
   * Get all available service types
   * @returns Array of available service types
   */
  public static getAvailableServiceTypes(): string[] {
    return [AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER, AI_SERVICE_OLLAMA];
  }
}
