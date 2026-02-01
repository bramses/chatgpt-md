/**
 * Input validation utilities for API requests and user input
 * Ensures all user inputs meet minimum requirements before processing
 */

/**
 * Validate that a string is not empty or whitespace-only
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if value is empty or invalid
 */
export function validateNonEmpty(value: any, fieldName: string): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  if (value.trim().length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

/**
 * Validate API key format
 * @param apiKey - The API key to validate
 * @param serviceName - Name of the service for error messages
 * @throws Error if API key is invalid
 */
export function validateApiKey(apiKey: string | undefined, serviceName: string): void {
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error(`${serviceName} API key is required`);
  }

  if (apiKey.trim().length === 0) {
    throw new Error(`${serviceName} API key cannot be empty`);
  }

  // Check minimum key length (most APIs have keys of at least 20 chars)
  if (apiKey.length < 10) {
    throw new Error(`${serviceName} API key appears to be invalid (too short)`);
  }
}

/**
 * Validate URL format
 * @param url - The URL to validate
 * @throws Error if URL is invalid
 */
export function validateUrl(url: string): void {
  if (typeof url !== "string") {
    throw new Error("URL must be a string");
  }

  if (url.trim().length === 0) {
    throw new Error("URL cannot be empty");
  }

  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
}

/**
 * Validate model ID format
 * @param modelId - The model ID to validate
 * @throws Error if model ID is invalid
 */
export function validateModelId(modelId: string): void {
  if (typeof modelId !== "string") {
    throw new Error("Model ID must be a string");
  }

  if (modelId.trim().length === 0) {
    throw new Error("Model ID cannot be empty");
  }

  // Model IDs should be reasonable length (not overly long)
  if (modelId.length > 255) {
    throw new Error("Model ID is too long");
  }
}

/**
 * Validate folder path
 * @param path - The folder path to validate
 * @throws Error if path is invalid
 */
export function validateFolderPath(path: string): void {
  if (typeof path !== "string") {
    throw new Error("Folder path must be a string");
  }

  if (path.trim().length === 0) {
    throw new Error("Folder path cannot be empty");
  }

  // Check for invalid characters in path
  const invalidChars = /[<>"|?*]/g;
  if (invalidChars.test(path)) {
    throw new Error("Folder path contains invalid characters");
  }
}

/**
 * Validate temperature parameter (0-2 range for most models)
 * @param temperature - The temperature value to validate
 * @throws Error if temperature is out of range
 */
export function validateTemperature(temperature: number): void {
  if (typeof temperature !== "number") {
    throw new Error("Temperature must be a number");
  }

  if (temperature < 0 || temperature > 2) {
    throw new Error("Temperature must be between 0 and 2");
  }
}

/**
 * Validate max tokens parameter
 * @param maxTokens - The max tokens value to validate
 * @throws Error if max tokens is invalid
 */
export function validateMaxTokens(maxTokens: number): void {
  if (typeof maxTokens !== "number") {
    throw new Error("Max tokens must be a number");
  }

  if (maxTokens < 1) {
    throw new Error("Max tokens must be at least 1");
  }

  if (maxTokens > 1000000) {
    throw new Error("Max tokens exceeds maximum allowed value");
  }
}

/**
 * Validate top_p parameter (0-1 range)
 * @param topP - The top_p value to validate
 * @throws Error if top_p is out of range
 */
export function validateTopP(topP: number): void {
  if (typeof topP !== "number") {
    throw new Error("Top P must be a number");
  }

  if (topP < 0 || topP > 1) {
    throw new Error("Top P must be between 0 and 1");
  }
}

/**
 * Validate that an array has content
 * @param array - The array to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if array is empty or not an array
 */
export function validateNonEmptyArray(array: any, fieldName: string): void {
  if (!Array.isArray(array)) {
    throw new Error(`${fieldName} must be an array`);
  }

  if (array.length === 0) {
    throw new Error(`${fieldName} cannot be empty`);
  }
}

/**
 * Sanitize user input to prevent injection attacks
 * @param input - The input to sanitize
 * @returns Sanitized input
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(/[<>&"']/g, (char) => {
      const escapeMap: Record<string, string> = {
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#x27;",
      };
      return escapeMap[char] || char;
    })
    .trim();
}

/**
 * Validate that a value is an object
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if value is not an object
 */
export function validateObject(value: any, fieldName: string): void {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${fieldName} must be an object`);
  }
}
