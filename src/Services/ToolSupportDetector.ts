/**
 * Minimal whitelist-based tool support detection
 *
 * Matching rules:
 * - Exact match: "o3" matches "o3"
 * - Date suffix match: "o3" matches "o3-2025-04-16" or "o3-20251101"
 * - Wildcard: "o3*" matches anything starting with "o3"
 */

import { getModelName } from "src/Utilities/ModelFilteringHelper";

/**
 * Check if a model matches any pattern in the whitelist
 */
export function isModelWhitelisted(modelId: string, whitelist: string): boolean {
  if (!whitelist || typeof whitelist !== "string") {
    return false;
  }

  const modelName = getModelName(modelId);
  const patterns = whitelist
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return patterns.some((pattern) => {
    // Wildcard matching
    if (pattern.endsWith("*")) {
      return modelName.startsWith(pattern.slice(0, -1));
    }

    // Exact match
    if (modelName === pattern) {
      return true;
    }

    // Date suffix match: "o3" matches "o3-20251101" or "o3-2025-04-16"
    if (modelName.startsWith(pattern)) {
      const suffix = modelName.slice(pattern.length);
      // Match -YYYYMMDD or -YYYY-MM-DD
      return /^-\d{8}$/.test(suffix) || /^-\d{4}-\d{2}-\d{2}$/.test(suffix);
    }

    return false;
  });
}

/**
 * Get the default whitelist value
 */
export function getDefaultToolWhitelist(): string {
  return `# OpenAI - GPT-5.2
gpt-5.2
gpt-5.2-chat-latest
gpt-5.2-pro

# OpenAI - o-series
o1
o3
o3-mini
o3-pro
o4-mini

# Anthropic - Claude 4.5
claude-opus-4-5
claude-haiku-4-5
claude-sonnet-4-5

# Gemini - Flash models
gemini-2.5-flash
gemini-2.5-flash-lite
gemini-flash-latest
gemini-flash-lite-latest
gemini-3-flash-preview`;
}
