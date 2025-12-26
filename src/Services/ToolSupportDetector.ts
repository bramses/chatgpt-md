/**
 * Whitelist-based tool support detection
 * 
 * Users configure which models can use tools via settings.
 * Supports wildcard patterns like gpt-4* to match multiple models.
 * OpenRouter API metadata is used as fallback for models not in whitelist.
 */

/**
 * Convert a glob-style pattern to a RegExp
 * Supports * as wildcard matching any characters
 * 
 * @param pattern - Glob pattern like "gpt-4*" or "claude-3-5-sonnet*"
 * @returns RegExp that matches the pattern
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Convert * to regex .*
  const regexPattern = escaped.replace(/\*/g, '.*');
  // Match the entire string
  return new RegExp(`^${regexPattern}$`, 'i');
}

/**
 * Parse the whitelist string into an array of patterns
 * 
 * @param whitelist - Newline-separated list of patterns
 * @returns Array of trimmed, non-empty patterns
 */
function parseWhitelist(whitelist: string): string[] {
  if (!whitelist || typeof whitelist !== 'string') {
    return [];
  }
  
  return whitelist
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Extract model name without provider prefix
 * e.g., "openai@gpt-4o" -> "gpt-4o"
 * 
 * @param modelId - Full model ID potentially with provider prefix
 * @returns Model name without prefix
 */
function extractModelName(modelId: string): string {
  const atIndex = modelId.indexOf('@');
  return atIndex !== -1 ? modelId.slice(atIndex + 1) : modelId;
}

/**
 * Check if a model matches any pattern in the whitelist
 * 
 * @param modelId - The model ID to check (with or without provider prefix)
 * @param whitelist - Newline-separated list of patterns from settings
 * @returns true if model matches any pattern
 */
export function isModelInWhitelist(modelId: string, whitelist: string): boolean {
  const modelName = extractModelName(modelId);
  const patterns = parseWhitelist(whitelist);
  
  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(modelName)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect if a model supports tools
 * 
 * Priority:
 * 1. Check user whitelist from settings
 * 2. For OpenRouter: check API metadata as fallback
 * 3. Default to false
 * 
 * @param serviceType - The AI service type (openai, anthropic, openrouter, etc.)
 * @param modelId - The model ID to check
 * @param whitelist - User-configured whitelist from settings
 * @param apiMetadata - Optional API metadata (e.g., from OpenRouter)
 * @returns true if the model supports tools
 */
export function detectToolSupport(
  serviceType: string,
  modelId: string,
  whitelist: string,
  apiMetadata?: any
): boolean {
  // For OpenRouter: API metadata is the primary source
  if (serviceType === "openrouter" && apiMetadata?.supported_parameters) {
    const supportsTools = apiMetadata.supported_parameters.includes("tools");
    console.log(`[ToolSupportDetector] OpenRouter API metadata for ${modelId}: ${supportsTools}`);
    return supportsTools;
  }
  
  // For other services: check user whitelist
  if (isModelInWhitelist(modelId, whitelist)) {
    console.log(`[ToolSupportDetector] Model ${modelId} matched whitelist`);
    return true;
  }
  
  // Default: no tool support
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
