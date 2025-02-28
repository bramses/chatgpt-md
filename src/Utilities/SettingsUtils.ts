import { AI_SERVICE_OPENROUTER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Gets the appropriate API key based on the service type
 * @param settings The plugin settings
 * @param serviceType The AI service type
 * @returns The appropriate API key for the service
 */
export const getApiKeyForService = (settings: ChatGPT_MDSettings, serviceType: string): string => {
  const keyMap: Record<string, string> = {
    [AI_SERVICE_OPENROUTER]: settings.openrouterApiKey,
    // Default to OpenAI API key for all other services
    default: settings.apiKey,
  };

  return keyMap[serviceType] || keyMap.default;
};

/**
 * Checks if an API key is valid (not empty or undefined)
 * @param apiKey The API key to check
 * @returns True if the API key is valid, false otherwise
 */
export const isValidApiKey = (apiKey?: string): boolean => {
  return !!apiKey && apiKey.trim() !== "";
};
