import { isValidApiKey } from "src/Services/ApiAuthService";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  AI_SERVICE_ZAI,
} from "src/Constants";

/**
 * Determine the AI provider from a model string
 * Handles explicit provider prefixes and URL-based detection
 */
export const aiProviderFromUrl = (url?: string, model?: string): string | undefined => {
  if (!model) {
    return undefined;
  }

  // Canonical: Check explicit provider prefixes
  const prefixMap: [string, string][] = [
    ["openai@", AI_SERVICE_OPENAI],
    ["anthropic@", AI_SERVICE_ANTHROPIC],
    ["gemini@", AI_SERVICE_GEMINI],
    ["ollama@", AI_SERVICE_OLLAMA],
    ["lmstudio@", AI_SERVICE_LMSTUDIO],
    ["openrouter@", AI_SERVICE_OPENROUTER],
    ["zai@", AI_SERVICE_ZAI],
    ["local@", AI_SERVICE_OLLAMA], // backward compatibility
  ];

  for (const [prefix, provider] of prefixMap) {
    if (model.startsWith(prefix)) {
      return provider;
    }
  }

  // URL-based detection (no explicit prefix)
  if (url) {
    // Remove trailing slash for comparison
    const normalizedUrl = url.replace(/\/$/, "");
    const baseUrl = normalizedUrl.replace(/^https?:\/\//, "");

    // OpenRouter detection
    if (baseUrl.includes("openrouter.ai")) {
      return AI_SERVICE_OPENROUTER;
    }

    // LM Studio detection
    if (baseUrl.includes("localhost:1234") || baseUrl.includes("127.0.0.1:1234")) {
      return AI_SERVICE_LMSTUDIO;
    }

    // Ollama detection
    if (baseUrl.includes("localhost:11434") || baseUrl.includes("127.0.0.1:11434")) {
      return AI_SERVICE_OLLAMA;
    }

    // Anthropic API detection
    if (baseUrl.includes("api.anthropic.com")) {
      return AI_SERVICE_ANTHROPIC;
    }

    // Gemini API detection
    if (baseUrl.includes("generativelanguage.googleapis.com")) {
      return AI_SERVICE_GEMINI;
    }

    // Z.AI API detection
    if (baseUrl.includes("api.z.ai")) {
      return AI_SERVICE_ZAI;
    }
  }

  return undefined;
};

/**
 * Determine the AI provider from available API keys
 * Uses a priority order: OpenAI > Anthropic > Gemini > OpenRouter > Z.AI
 */
export const aiProviderFromKeys = (config: Record<string, any>): string | null => {
  const hasOpenRouterKey = isValidApiKey(config.openrouterApiKey);
  const hasOpenAIKey = isValidApiKey(config.apiKey);
  const hasAnthropicKey = isValidApiKey(config.anthropicApiKey);
  const hasGeminiKey = isValidApiKey(config.geminiApiKey);
  const hasZaiKey = isValidApiKey(config.zaiApiKey);

  // Priority order: OpenAI > Anthropic > Gemini > OpenRouter > Z.AI
  if (hasOpenAIKey) {
    return AI_SERVICE_OPENAI;
  } else if (hasAnthropicKey) {
    return AI_SERVICE_ANTHROPIC;
  } else if (hasGeminiKey) {
    return AI_SERVICE_GEMINI;
  } else if (hasOpenRouterKey) {
    return AI_SERVICE_OPENROUTER;
  } else if (hasZaiKey) {
    return AI_SERVICE_ZAI;
  }

  return null;
};
