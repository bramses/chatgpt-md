import { NotificationService } from "./NotificationService";
import {
  CHAT_ERROR_MESSAGE_401,
  CHAT_ERROR_MESSAGE_404,
  CHAT_ERROR_MESSAGE_NO_CONNECTION,
  CHAT_ERROR_RESPONSE,
  ERROR_NO_CONNECTION,
  NEWLINE,
} from "src/Constants";

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
    let errorType = ErrorType.UNKNOWN_ERROR;
    let errorMessage = "";
    let chatMessage = "";

    // Extract context information if available
    const model = options.context?.model || "";
    const url = options.context?.url || "";
    const status = options.context?.status;
    const contextInfo = this.formatContextInfo(model, url);

    // Determine error type and messages
    if (error instanceof Object) {
      if (error.name === "AbortError") {
        errorType = ErrorType.STREAM_ABORTED;
        errorMessage = `${prefix}: Stream aborted`;
        chatMessage = "Stream aborted";
      } else if (error.message === ERROR_NO_CONNECTION) {
        errorType = ErrorType.NETWORK_ERROR;
        errorMessage = `${prefix}: Network connection error`;
        chatMessage = CHAT_ERROR_MESSAGE_NO_CONNECTION;
      } else if (error.status === 401 || error.error?.status === 401) {
        errorType = ErrorType.AUTHENTICATION_ERROR;
        errorMessage = `${prefix}: Authentication failed (401)`;
        chatMessage = CHAT_ERROR_MESSAGE_401;
      } else if (error.status === 404 || error.error?.status === 404) {
        errorType = ErrorType.NOT_FOUND_ERROR;
        errorMessage = `${prefix}: Resource not found (404)${contextInfo ? ` - ${contextInfo}` : ""}`;
        chatMessage = `${CHAT_ERROR_MESSAGE_404}${contextInfo ? `${NEWLINE}${contextInfo}` : ""}`;
      } else if (
        serviceName === "openrouter" &&
        (status === 400 || error.status === 400 || error.error?.status === 400)
      ) {
        errorType = ErrorType.VALIDATION_ERROR;
        errorMessage = `${prefix}: Bad Request (400)${contextInfo ? ` - ${contextInfo}` : ""}`;

        // Special handling for OpenRouter model errors
        if (error.error?.message?.includes("model") || error.message?.includes("model")) {
          chatMessage = `I am sorry, I could not answer your request because of an error with the model.`;
        } else {
          chatMessage = `I am sorry, your request contained invalid parameters (400).`;
        }
      } else if (error.error) {
        errorType = ErrorType.API_ERROR;
        errorMessage = `${prefix}: ${error.error.message}${contextInfo ? ` - ${contextInfo}` : ""}`;
        chatMessage = `${CHAT_ERROR_RESPONSE}${NEWLINE}${error.error.message}${contextInfo ? `${NEWLINE}${contextInfo}` : ""}`;
      } else {
        errorMessage = `${prefix}: ${JSON.stringify(error)}${contextInfo ? ` - ${contextInfo}` : ""}`;
        chatMessage = `${CHAT_ERROR_RESPONSE}${NEWLINE}${JSON.stringify(error)}${contextInfo ? `${NEWLINE}${contextInfo}` : ""}`;
      }
    } else {
      errorMessage = `${prefix}: ${error}${contextInfo ? ` - ${contextInfo}` : ""}`;
      chatMessage = `${CHAT_ERROR_RESPONSE}${NEWLINE}${error}${contextInfo ? `${NEWLINE}${contextInfo}` : ""}`;
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
      // For 404 errors, provide a more specific message
      if (errorType === ErrorType.NOT_FOUND_ERROR) {
        let errorMessage =
          "I am sorry, I could not answer your request because of an error, here is what went wrong-\n\n";

        // Extract the error message if available
        let errorDetail = "";
        if (error.error?.message) {
          errorDetail = error.error.message;
        } else if (error.message) {
          errorDetail = error.message;
        } else {
          errorDetail = "Resource not found (404)";
        }

        // Add the error detail
        errorMessage += `${errorDetail}\n\n`;

        if (serviceName === "ollama") {
          errorMessage += `The Ollama API could not find the requested resource. Please check if:
1. Ollama is running locally
2. The model "${model}" is installed in Ollama
3. The URL "${url}" is correct\n\n`;
        } else if (serviceName === "openrouter") {
          errorMessage += `The OpenRouter API could not find the requested resource. Please check if:
1. Your OpenRouter API key is correct
2. The model "${model}" is available on OpenRouter
3. The URL "${url}" is correct\n\n`;
        } else if (serviceName === "openai") {
          errorMessage += `The OpenAI API could not find the requested resource. Please check if:
1. Your OpenAI API key is correct and has sufficient credits
2. The model "${model}" is available and spelled correctly
3. The URL "${url}" is correct\n\n`;
        } else {
          errorMessage += `Please check your URL or model name in the settings or frontmatter.\n\n`;
        }

        errorMessage += `Model- ${model}, URL- ${url}`;
        return errorMessage;
      }

      // For 400 errors from OpenRouter, provide model-specific guidance
      if (serviceName === "openrouter" && (status === 400 || error.status === 400 || error.error?.status === 400)) {
        let errorMessage =
          "I am sorry, I could not answer your request because of an error, here is what went wrong-\n\n";

        // Extract the error message if available
        let errorDetail = "";
        if (error.error?.message) {
          errorDetail = error.error.message;
        } else if (error.message) {
          errorDetail = error.message;
        } else {
          errorDetail = "Bad Request (400)";
        }

        // Add the error detail
        errorMessage += `${errorDetail}\n\n`;

        // If it seems to be a model-related error, add specific guidance
        if (errorDetail.toLowerCase().includes("model")) {
          errorMessage += `The model "${model}" may not be available on OpenRouter. Please check:
1. That you've spelled the model name correctly
2. That the model exists on OpenRouter
3. That you have access to this model with your current plan\n\n`;
        } else {
          errorMessage += "Your request contained invalid parameters. Please check your settings or frontmatter.\n\n";
        }

        errorMessage += `Model- ${model}, URL- ${url}`;
        return errorMessage;
      }

      // Format the error message for chat display with proper URL formatting
      let errorDetail = "undefined";
      if (error instanceof Object) {
        if (error.error?.message) {
          errorDetail = error.error.message;
        } else if (error.message) {
          errorDetail = error.message;
        } else if (error.statusText) {
          errorDetail = `${error.status || ""} ${error.statusText}`;
        } else if (typeof error === "string") {
          errorDetail = error;
        } else {
          try {
            errorDetail = JSON.stringify(error);
          } catch (e) {
            errorDetail = "Error could not be formatted";
          }
        }
      } else if (error) {
        errorDetail = String(error);
      }

      return `I am sorry, I could not answer your request because of an error, here is what went wrong-

${errorDetail}

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

Model- ${serviceName === "ollama" ? "llama2" : "unknown"}, URL- ${url}`;
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
