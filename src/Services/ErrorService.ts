import { NotificationService } from "./NotificationService";
import { AI_SERVICE_OLLAMA, ERROR_NO_CONNECTION } from "src/Constants";

/**
 * Error types that can be handled by the ErrorService
 */
export enum ErrorType {
  API_ERROR = "api_error",
  NETWORK_ERROR = "network_error",
  AUTHENTICATION_ERROR = "authentication_error",
  NOT_FOUND_ERROR = "not_found_error",
  VALIDATION_ERROR = "validation_error",
  UNKNOWN_ERROR = "unknown_error",
  STREAM_ABORTED = "stream_aborted",
}

/**
 * Options for error handling
 */
export interface ErrorHandlingOptions {
  /** Whether to show a notification */
  showNotification?: boolean;
  /** Whether to log to console */
  logToConsole?: boolean;
  /** Whether to return a user-friendly message for chat */
  returnForChat?: boolean;
  /** Additional context for the error */
  context?: Record<string, any>;
}

/**
 * Service for centralized error handling
 */
export class ErrorService {
  constructor(private notificationService: NotificationService) {}

  /**
   * Handle API errors from any service
   */
  handleApiError(
    error: any,
    serviceName: string,
    options: ErrorHandlingOptions = {
      showNotification: true,
      logToConsole: true,
      returnForChat: false,
    }
  ): string {
    const prefix = `[ChatGPT MD] ${serviceName}`;
    let errorMessage = "";

    // Extract context information if available
    const model = options.context?.model || "";
    const url = options.context?.url || "";
    const contextInfo = this.formatContextInfo(model, url);

    // Determine error type and messages
    if (error instanceof Object) {
      if (error.name === "AbortError") {
        errorMessage = `${prefix}: Stream aborted`;
      } else if (error.message === ERROR_NO_CONNECTION) {
        errorMessage = `${prefix}: Network connection error`;
      } else if (error.status === 401 || error.error?.status === 401) {
        errorMessage = `${prefix}: Authentication failed (401)`;
      } else if (error.status === 404 || error.error?.status === 404) {
        errorMessage = `${prefix}: Resource not found (404)${contextInfo ? ` - ${contextInfo}` : ""}`;
      } else if (error.error) {
        errorMessage = `${prefix}: ${error.error.message}${contextInfo ? ` - ${contextInfo}` : ""}`;
      } else {
        errorMessage = `${prefix}: ${JSON.stringify(error)}${contextInfo ? ` - ${contextInfo}` : ""}`;
      }
    } else {
      errorMessage = `${prefix}: ${error}${contextInfo ? ` - ${contextInfo}` : ""}`;
    }

    // Log to console if requested
    if (options.logToConsole) {
      console.error(errorMessage, error, options.context);
    }

    // Show notification if requested
    if (options.showNotification) {
      this.notificationService.showNotification(errorMessage, 5000);
    }

    // Return message for chat if requested
    if (options.returnForChat) {
      // Format the error message for chat display with proper URL formatting
      return `I am sorry, I could not answer your request because of an error, here is what went wrong-

${error instanceof Object && error.error ? error.error.message : error?.message || error || "undefined"}

Model- ${model}, URL- ${url}`;
    }

    // Throw error for caller to handle
    throw new Error(errorMessage);
  }

  /**
   * Format context information for error messages
   */
  private formatContextInfo(model: string, url: string): string {
    const parts = [];
    if (model) parts.push(`Model: ${model}`);
    if (url) {
      // Ensure URL is displayed correctly without replacing special characters
      parts.push(`URL: ${url}`);
    }
    return parts.length > 0 ? parts.join(", ") : "";
  }

  /**
   * Handle URL configuration errors
   */
  handleUrlError(url: string, defaultUrl: string, serviceName: string): string {
    const errorMessage = `[ChatGPT MD] Error calling specified URL: ${url}`;

    this.notificationService.showNotification(errorMessage);
    console.error(errorMessage, { url, defaultUrl, serviceName });

    // Format the URL properly for display in the chat message
    return `I am sorry, I could not answer your request because of an error, here is what went wrong-

Error connecting to the custom URL.

Model- ${serviceName === AI_SERVICE_OLLAMA ? "llama2" : "unknown"}, URL- ${url}`;
  }

  /**
   * Handle model configuration errors
   */
  handleModelError(model: string, serviceName: string): string {
    const errorMessage = `[ChatGPT MD] Error calling model: ${model}`;

    this.notificationService.showNotification(errorMessage);
    console.error(errorMessage, { model, serviceName });

    return `I am sorry, there was an error with the model: ${model}. Please check your settings or try a different model.`;
  }

  /**
   * Handle validation errors
   */
  handleValidationError(message: string, context?: Record<string, any>): never {
    const errorMessage = `[ChatGPT MD] Validation Error: ${message}`;

    this.notificationService.showNotification(errorMessage);
    console.error(errorMessage, context);

    throw new Error(errorMessage);
  }
}
