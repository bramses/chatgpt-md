import { AI_SERVICE_OLLAMA, AI_SERVICE_OPENAI, AI_SERVICE_OPENROUTER } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { NotificationService } from "./NotificationService";

/**
 * ApiAuthService handles authentication for API requests
 * It centralizes API key management and validation
 */
export class ApiAuthService {
  private notificationService: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
  }

  /**
   * Checks if an API key is valid (not empty or undefined)
   * @param apiKey The API key to check
   * @returns True if the API key is valid, false otherwise
   */
  isValidApiKey(apiKey?: string): boolean {
    return !!apiKey && apiKey.trim() !== "";
  }

  /**
   * Get the appropriate API key for the service from settings
   * @param settings The plugin settings
   * @param serviceType The AI service type
   * @returns The API key for the service
   */
  getApiKey(settings: ChatGPT_MDSettings, serviceType: string): string {
    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        return settings.apiKey;
      case AI_SERVICE_OPENROUTER:
        return settings.openrouterApiKey;
      case AI_SERVICE_OLLAMA:
        return ""; // Ollama doesn't use an API key
      default:
        return "";
    }
  }

  /**
   * Validate that the API key is present and valid
   * @param apiKey The API key to validate
   * @param serviceName The name of the service for error messages
   * @throws Error if the API key is invalid
   */
  validateApiKey(apiKey: string | undefined, serviceName: string): void {
    // Skip validation for Ollama as it doesn't require an API key
    if (serviceName === AI_SERVICE_OLLAMA) {
      return;
    }

    if (!this.isValidApiKey(apiKey)) {
      const errorMessage = `${serviceName} API key is missing or invalid. Please add your ${serviceName} API key in the settings.`;
      this.notificationService.showError(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Create authentication headers for the API request
   * @param apiKey The API key
   * @param serviceType The AI service type
   * @returns Headers object with authentication
   */
  createAuthHeaders(apiKey: string, serviceType: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    switch (serviceType) {
      case AI_SERVICE_OPENAI:
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
      case AI_SERVICE_OPENROUTER:
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["HTTP-Referer"] = "https://github.com/bramses/chatgpt-md";
        headers["X-Title"] = "Obsidian ChatGPT MD Plugin";
        break;
      case AI_SERVICE_OLLAMA:
        // Ollama doesn't require authentication headers
        break;
    }

    return headers;
  }
}
