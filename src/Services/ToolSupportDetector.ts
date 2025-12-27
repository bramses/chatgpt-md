/**
 * Whitelist-based tool support detection
 *
 * Users configure which models can use tools via settings.
 * 
 * Matching Strategy (simple and model-agnostic):
 * - Exact match: "o3" matches "o3"
 * - Date suffix match: "o3" matches "o3-2025-04-16" (date is safe)
 * - NO other suffix match: "o3" does NOT match "o3-mini" or "o3-deep-research"
 * - Explicit wildcard: "o3*" matches everything starting with "o3"
 */

/**
 * Check if a suffix is a date pattern (safe to match automatically)
 * 
 * Recognizes common date formats used by AI providers:
 * - YYYYMMDD (Anthropic style: -20251101)
 * - YYYY-MM-DD (OpenAI style: -2025-04-16)
 * 
 * @param suffix - The suffix after the base model name (including leading dash)
 * @returns true if suffix is a date pattern
 */
function isDateSuffix(suffix: string): boolean {
  if (!suffix || suffix.length === 0) {
    return false;
  }
  
  // Must start with a dash
  if (!suffix.startsWith("-")) {
    return false;
  }
  
  const datePatterns = [
    /^-\d{8}$/,              // -YYYYMMDD (e.g., -20251101)
    /^-\d{4}-\d{2}-\d{2}$/,  // -YYYY-MM-DD (e.g., -2025-04-16)
  ];
  
  return datePatterns.some(pattern => pattern.test(suffix));
}

/**
 * Check if a model ID matches a pattern
 *
 * Matching rules:
 * 1. Exact match: pattern equals model name
 * 2. Date suffix match: model starts with pattern AND remainder is a date
 * 3. Explicit wildcard: pattern ends with * for prefix matching
 * 4. Provider prefix: optional, matches against full ID or just model name
 * 5. OpenRouter special case: patterns without provider prefix match OpenRouter models
 *    (e.g., "gpt-5.2" matches both "openai@gpt-5.2" and "openrouter@openai/gpt-5.2")
 *
 * @param modelId - Full model ID like "openai@gpt-5.2", "openrouter@openai/gpt-5.2", or "gpt-5.2"
 * @param pattern - Pattern like "gpt-5.2" (exact/date) or "gpt-5.2*" (prefix)
 * @returns true if model matches pattern
 */
function matchesPattern(modelId: string, pattern: string): boolean {
  // Extract model name (part after @) for matching
  let modelName = modelId.includes("@") ? modelId.split("@")[1] : modelId;
  
  // For OpenRouter models with format "openrouter@provider/model", extract just the model part
  // e.g., "openrouter@openai/gpt-5.2" -> "gpt-5.2"
  if (modelName.includes("/")) {
    modelName = modelName.split("/")[1];
  }
  
  // Check if pattern includes provider prefix
  const patternHasProvider = pattern.includes("@");
  const patternName = patternHasProvider ? pattern.split("@")[1] : pattern;
  const patternProvider = patternHasProvider ? pattern.split("@")[0] : null;
  const modelProvider = modelId.includes("@") ? modelId.split("@")[0] : null;
  
  // If pattern has provider, it must match exactly
  if (patternHasProvider && patternProvider !== modelProvider) {
    return false;
  }
  
  // If pattern has no provider and model is openrouter, allow matching
  // (OpenRouter proxies models from other providers)
  // Otherwise, if pattern has no provider, it matches any provider
  
  // Use model name for matching
  const nameToMatch = modelName;
  const patternToMatch = patternName;
  
  // Check for explicit wildcard (prefix matching)
  if (patternToMatch.endsWith("*")) {
    const prefix = patternToMatch.slice(0, -1);
    return nameToMatch.startsWith(prefix);
  }
  
  // Exact match
  if (nameToMatch === patternToMatch) {
    return true;
  }
  
  // Date suffix match: model starts with pattern AND remainder is a date
  if (nameToMatch.startsWith(patternToMatch)) {
    const suffix = nameToMatch.slice(patternToMatch.length);
    if (isDateSuffix(suffix)) {
      return true;
    }
  }
  
  return false;
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
 *
 * @param modelId - The model ID to check (with or without provider prefix)
 * @param whitelist - Newline-separated list of patterns from settings
 * @returns true if model matches any pattern
 */
export function isModelInWhitelist(modelId: string, whitelist: string): boolean {
  const patterns = parseWhitelist(whitelist);

  for (const pattern of patterns) {
    if (matchesPattern(modelId, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Detect if a model supports tools
 *
 * Tool support is determined solely by the user-configured whitelist.
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
 * 
 * Lists important models explicitly. Date-suffixed versions are matched automatically.
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
