/**
 * Standardized error message formatting
 * Provides consistent, user-friendly error messages across the application
 */

/**
 * Standard error messages for common scenarios
 */
export const ErrorMessages = {
  API: {
    AUTH_FAILED: "Authentication failed. Please check your API key in settings.",
    NETWORK_ERROR: "Network error. Please check your connection and try again.",
    RATE_LIMIT: "Rate limit exceeded. Please wait and try again.",
    INVALID_MODEL: "Invalid model selected. Please choose a different model.",
    TIMEOUT: "Request timed out. Please try again.",
    INVALID_RESPONSE: "Invalid response from API. Please try again.",
    CONNECTION_REFUSED: "Connection refused. Please check the API URL in settings.",
  },
  VAULT: {
    FILE_NOT_FOUND: (path: string) => `File not found: ${path}`,
    FOLDER_NOT_FOUND: (path: string) => `Folder not found: ${path}`,
    READ_ERROR: (path: string) => `Error reading file: ${path}`,
    WRITE_ERROR: (path: string) => `Error writing to file: ${path}`,
  },
  TOOL: {
    EXECUTION_FAILED: (toolName: string) => `Failed to execute tool: ${toolName}`,
    APPROVAL_CANCELLED: "Tool execution cancelled by user",
    INVALID_PARAMS: (toolName: string) => `Invalid parameters for tool: ${toolName}`,
    NOT_SUPPORTED: (toolName: string) => `Tool ${toolName} is not supported by this model`,
  },
  VALIDATION: {
    REQUIRED_FIELD: (field: string) => `${field} is required`,
    INVALID_URL: (url: string) => `Invalid URL: ${url}`,
    INVALID_FORMAT: (field: string, format: string) =>
      `Invalid ${field} format. Expected: ${format}`,
    EMPTY_CONTENT: "Content cannot be empty",
  },
  SETTINGS: {
    MISSING_API_KEY: (service: string) => `Missing API key for ${service}. Please add it in settings.`,
    INVALID_FOLDER: (folder: string) => `Invalid folder path: ${folder}`,
    MISSING_MODEL: "No model selected. Please choose a model in settings or note frontmatter.",
  },
};

/**
 * Format error for user display
 * @param error - Error object or message string
 * @param context - Optional context about where the error occurred
 * @returns Formatted error message
 */
export function formatError(error: Error | string, context?: string): string {
  const message = typeof error === "string" ? error : error.message;
  return context ? `[${context}] ${message}` : message;
}

/**
 * Get user-friendly error message from HTTP status code
 * @param status - HTTP status code
 * @returns User-friendly error message
 */
export function getHttpErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return "Bad request. Please check your input and try again.";
    case 401:
      return ErrorMessages.API.AUTH_FAILED;
    case 403:
      return "Access forbidden. Please check your API key and permissions.";
    case 404:
      return "Resource not found. Please check the URL or model name.";
    case 429:
      return ErrorMessages.API.RATE_LIMIT;
    case 500:
    case 502:
    case 503:
      return "Server error. Please try again later.";
    case 504:
      return "Gateway timeout. The request took too long. Please try again.";
    default:
      return `API error (${status}). Please try again.`;
  }
}

/**
 * Extract meaningful error message from various error types
 * @param error - Error object or any value
 * @returns Clean error message
 */
export function extractErrorMessage(error: any): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.error?.message) {
    return error.error.message;
  }

  if (error?.error) {
    return typeof error.error === "string" ? error.error : JSON.stringify(error.error);
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Format error for logging (includes more detail than user display)
 * @param error - Error object
 * @param context - Optional context
 * @returns Detailed error message for logging
 */
export function formatErrorForLogging(error: any, context?: string): string {
  const message = extractErrorMessage(error);
  const prefix = context ? `[${context}]` : "[Error]";

  if (error instanceof Error && error.stack) {
    return `${prefix} ${message}\n${error.stack}`;
  }

  return `${prefix} ${message}`;
}
