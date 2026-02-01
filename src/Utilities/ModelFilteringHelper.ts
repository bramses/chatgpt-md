/**
 * Centralized model filtering and validation utilities
 * Eliminates duplication between ToolSupportDetector and FrontmatterHelpers
 */

import { ProviderType } from "src/Services/Adapters/ProviderAdapter";

export interface ModelInfo {
  fullId: string; // "openai@gpt-4"
  provider: ProviderType; // "openai"
  modelId: string; // "gpt-4"
}

/**
 * Parse model ID into provider and model components
 *
 * @param fullId - Model ID with optional provider prefix
 * @returns Parsed model information
 *
 * @example
 * parseModelId("openai@gpt-4") // { fullId: "openai@gpt-4", provider: "openai", modelId: "gpt-4" }
 * parseModelId("gpt-4")        // { fullId: "openai@gpt-4", provider: "openai", modelId: "gpt-4" }
 */
export function parseModelId(fullId: string): ModelInfo {
  const parts = fullId.split("@");

  if (parts.length === 2) {
    return {
      fullId,
      provider: parts[0] as ProviderType,
      modelId: parts[1],
    };
  }

  // Default to OpenAI if no prefix
  return {
    fullId: `openai@${fullId}`,
    provider: "openai",
    modelId: fullId,
  };
}

/**
 * Check if model ID matches a pattern (string or regex)
 *
 * @param modelId - Model ID to check
 * @param pattern - String pattern (uses includes) or RegExp
 * @returns True if matches
 */
export function modelMatches(modelId: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return modelId.includes(pattern);
  }
  return pattern.test(modelId);
}

/**
 * Extract provider from model ID
 *
 * @param modelId - Full model ID
 * @returns Provider type
 */
export function extractProvider(modelId: string): ProviderType {
  return parseModelId(modelId).provider;
}

/**
 * Get just the model name without provider prefix
 *
 * @param fullId - Full model ID
 * @returns Model name only
 *
 * @example
 * getModelName("openai@gpt-4")                // "gpt-4"
 * getModelName("openrouter@openai/gpt-5.2")   // "gpt-5.2"
 * getModelName("gpt-4")                       // "gpt-4"
 */
export function getModelName(fullId: string): string {
  let modelId = parseModelId(fullId).modelId;

  // Handle OpenRouter format "provider/model"
  if (modelId.includes("/")) {
    modelId = modelId.split("/")[1];
  }

  return modelId;
}
