/**
 * Whitelist-based tool support detection
 *
 * Users configure which models can use tools via settings.
 * Supports wildcard patterns like gpt-4* to match multiple models.
 */

/**
 * Convert a pattern to a RegExp for substring matching
 * Treats the pattern as a substring to match anywhere in the model ID
 * Ignores asterisks as they're just visual separators
 *
 * @param pattern - Pattern like "gpt-4" or "gpt-5.1*"
 * @returns RegExp that matches the pattern as a substring
 */
function patternToRegex(pattern: string): RegExp {
  // Remove asterisks and escape special regex characters
  const cleaned = pattern.replace(/\*/g, "").replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  // Match as substring anywhere in the string
  return new RegExp(cleaned, "i");
}

/**
 * Parse the whitelist string into an array of patterns
 *
 * @param whitelist - Comma or newline-separated list of patterns
 * @returns Array of trimmed, non-empty patterns
 */
function parseWhitelist(whitelist: string): string[] {
  if (!whitelist || typeof whitelist !== "string") {
    return [];
  }

  return whitelist
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Check if a model matches any pattern in the whitelist
 * Uses substring matching on the full model ID
 *
 * @param modelId - The model ID to check (with or without provider prefix)
 * @param whitelist - Newline-separated list of patterns from settings
 * @returns true if model matches any pattern
 */
export function isModelInWhitelist(modelId: string, whitelist: string): boolean {
  const patterns = parseWhitelist(whitelist);

  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(modelId)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect if a model supports tools
 *
 * Tool support is determined solely by the user-configured whitelist.
 * Model names are matched without provider prefix.
 *
 * @param modelId - The model ID to check (with or without provider prefix)
 * @param whitelist - User-configured whitelist from settings
 * @returns true if the model matches the whitelist
 */
export function detectToolSupport(modelId: string, whitelist: string): boolean {
  if (isModelInWhitelist(modelId, whitelist)) {
    console.log(`[ToolSupportDetector] Model ${modelId} matched whitelist`);
    return true;
  }

  console.log(`[ToolSupportDetector] Model ${modelId} not in whitelist, tools disabled`);
  return false;
}

/**
 * Get the default whitelist value
 * Used for initial settings and reset
 */
export function getDefaultToolWhitelist(): string {
  return "gpt-5.2*";
}
