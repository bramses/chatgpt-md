/**
 * Centralized tool support detection for all AI providers
 * Single source of truth for which models support tool calling
 *
 * Note: Neither OpenAI's API nor the @ai-sdk/openai library expose tool capability metadata.
 * This requires manual maintenance using pattern matching and explicit lookup tables.
 * See: https://community.openai.com/t/expose-model-capabilities-in-the-v1-models-api-response/1314117
 */

/**
 * Explicit list of OpenAI models with known tool support status
 * This takes precedence over pattern matching for accuracy
 * Generated from: https://platform.openai.com/docs/models
 */
const OPENAI_TOOL_SUPPORT: Record<string, boolean> = {
  // Reasoning models - DO NOT support tools
  "o1": false,
  "o1-2024-12-17": false,
  "o1-preview": false,
  "o1-mini": false,
  "o1-pro": false,
  "o1-pro-2025-03-19": false,
  "o3": false,
  "o3-mini": false,
  "o3-mini-2025-01-31": false,
  "o3-2025-04-16": false,
  "o3-pro": false,
  "o3-pro-2025-06-10": false,
  "o3-deep-research": false,
  "o3-deep-research-2025-06-26": false,
  "o4-mini": false,
  "o4-mini-2025-04-16": false,
  "o4-mini-deep-research": false,
  "o4-mini-deep-research-2025-06-26": false,

  // Standard chat models - DO support tools
  "gpt-4": true,
  "gpt-4-0613": true,
  "gpt-4-0125-preview": true,
  "gpt-4-turbo": true,
  "gpt-4-turbo-preview": true,
  "gpt-4-turbo-2024-04-09": true,
  "gpt-4-1106-preview": true,
  "gpt-4o": true,
  "gpt-4o-2024-05-13": true,
  "gpt-4o-2024-08-06": true,
  "gpt-4o-2024-11-20": true,
  "gpt-4o-mini": true,
  "gpt-4o-mini-2024-07-18": true,
  "gpt-4.1": true,
  "gpt-4.1-2025-04-14": true,
  "gpt-4.1-mini": true,
  "gpt-4.1-mini-2025-04-14": true,
  "gpt-4.1-nano": true,
  "gpt-4.1-nano-2025-04-14": true,
  "gpt-3.5-turbo": true,
  "gpt-3.5-turbo-0125": true,
  "gpt-3.5-turbo-1106": true,
  "chatgpt-4o-latest": true,
  "gpt-5": true,
  "gpt-5-2025-08-07": true,
  "gpt-5-mini": true,
  "gpt-5-mini-2025-08-07": true,
  "gpt-5-nano": true,
  "gpt-5-nano-2025-08-07": true,
  "gpt-5-pro": true,
  "gpt-5-pro-2025-10-06": true,
  "gpt-5-chat-latest": true,
  "gpt-5-codex": true,
  "gpt-5.1": true,
  "gpt-5.1-2025-11-13": true,
  "gpt-5.1-chat-latest": true,
  "gpt-5.1-codex": true,
  "gpt-5.2": true,
  "gpt-5.2-2025-12-11": true,
  "gpt-5.2-pro": true,
  "gpt-5.2-pro-2025-12-11": true,
  "gpt-5.2-chat-latest": true,

  // Instruct models - DO NOT support tools (not for chat)
  "gpt-3.5-turbo-instruct": false,
  "gpt-3.5-turbo-instruct-0914": false,

  // Specialized variants - DO NOT support tools (not for chat)
  // Audio/Realtime models
  "gpt-4o-audio-preview": false,
  "gpt-4o-audio-preview-2024-12-17": false,
  "gpt-4o-audio-preview-2025-06-03": false,
  "gpt-4o-realtime-preview": false,
  "gpt-4o-realtime-preview-2024-12-17": false,
  "gpt-4o-realtime-preview-2025-06-03": false,
  "gpt-4o-mini-realtime-preview": false,
  "gpt-4o-mini-realtime-preview-2024-12-17": false,
  "gpt-4o-mini-audio-preview": false,
  "gpt-4o-mini-audio-preview-2024-12-17": false,
  "gpt-realtime": false,
  "gpt-realtime-2025-08-28": false,
  "gpt-realtime-mini": false,
  "gpt-realtime-mini-2025-10-06": false,
  "gpt-audio": false,
  "gpt-audio-2025-08-28": false,
  "gpt-audio-mini": false,
  "gpt-audio-mini-2025-10-06": false,
  "gpt-realtime-mini-2025-12-15": false,
  "gpt-audio-mini-2025-12-15": false,
  // Search models
  "gpt-4o-search-preview": false,
  "gpt-4o-search-preview-2025-03-11": false,
  "gpt-4o-mini-search-preview": false,
  "gpt-4o-mini-search-preview-2025-03-11": false,
  "gpt-5-search-api": false,
  "gpt-5-search-api-2025-10-14": false,
  // Transcribe models
  "gpt-4o-transcribe": false,
  "gpt-4o-mini-transcribe": false,
  "gpt-4o-transcribe-diarize": false,
  "gpt-4o-mini-transcribe-2025-12-15": false,
  "gpt-4o-mini-transcribe-2025-03-20": false,
  // TTS models
  "gpt-4o-mini-tts": false,
  "gpt-4o-mini-tts-2025-03-20": false,
  "gpt-4o-mini-tts-2025-12-15": false,

  // Non-chat models (filtered out but included for completeness)
  "davinci-002": false,
  "babbage-002": false,
  "gpt-3.5-turbo-16k": false,
  "text-embedding-ada-002": false,
  "text-embedding-3-small": false,
  "text-embedding-3-large": false,
  "tts-1": false,
  "tts-1-1106": false,
  "tts-1-hd": false,
  "tts-1-hd-1106": false,
  "whisper-1": false,
  "dall-e-2": false,
  "dall-e-3": false,
  "chatgpt-image-latest": false,
  "gpt-image-1": false,
  "gpt-image-1-mini": false,
  "gpt-image-1.5": false,
  "omni-moderation-latest": false,
  "omni-moderation-2024-09-26": false,
  "sora-2": false,
  "sora-2-pro": false,
};

/**
 * Regex patterns for detecting tool support per service
 * Used as fallback when model is not in explicit list
 * Patterns are checked in order: noSupport first (more specific), then support
 */
const TOOL_SUPPORT_PATTERNS: Record<string, { support: RegExp[]; noSupport?: RegExp[] }> = {
  openai: {
    // Reasoning models never support tools - check these FIRST
    noSupport: [/^o[13]/],
    // Then standard models that DO support tools
    support: [/^gpt-4/, /^gpt-5/, /^gpt-3\.5-turbo/, /^chatgpt-4o-latest/],
  },
  anthropic: {
    support: [/^claude-3/],
  },
  gemini: {
    support: [/gemini-2/, /gemini-pro/],
  },
  ollama: {
    support: [/llama-?3/i, /mistral/i, /mixtral/i, /qwen/i, /gemma/i],
  },
  lmstudio: {
    support: [/llama-?3/i, /mistral/i],
  },
};

/**
 * Detect if a model supports tools based on service type and model ID
 *
 * @param serviceType - The AI service type (openai, anthropic, etc.)
 * @param modelId - The model ID to check
 * @param apiMetadata - Optional API metadata (e.g., from OpenRouter)
 * @returns true if the model is known to support tools, false otherwise
 */
export function detectToolSupport(
  serviceType: string,
  modelId: string,
  apiMetadata?: any
): boolean {
  // OpenRouter: use actual API data if available (most reliable)
  if (serviceType === "openrouter" && apiMetadata?.supported_parameters) {
    return apiMetadata.supported_parameters.includes("tools");
  }

  // OpenAI: check explicit list first (for accuracy on known edge cases like reasoning models)
  if (serviceType === "openai" && modelId in OPENAI_TOOL_SUPPORT) {
    return OPENAI_TOOL_SUPPORT[modelId];
  }

  // Other services and pattern matching fallback
  const patterns = TOOL_SUPPORT_PATTERNS[serviceType];
  if (!patterns) {
    return false;
  }

  // Check negative patterns first (e.g., reasoning models that don't support tools)
  if (patterns.noSupport?.some((pattern) => modelId.match(pattern))) {
    return false;
  }

  // Then check positive patterns
  return patterns.support.some((pattern) => modelId.match(pattern));
}

/**
 * Get all supported patterns for a given service
 * Useful for debugging or documentation
 */
export function getToolSupportPatterns(serviceType: string): { support: RegExp[]; noSupport?: RegExp[] } | undefined {
  return TOOL_SUPPORT_PATTERNS[serviceType];
}
