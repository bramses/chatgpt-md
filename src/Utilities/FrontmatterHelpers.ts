import { ChatGPT_MDSettings } from "src/Models/Config";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  AI_SERVICE_ZAI,
} from "src/Constants";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
  DEFAULT_ZAI_CONFIG,
} from "src/Services/DefaultConfigs";

// ModelFilteringHelper exports are available for use elsewhere

/**
 * Get the default configuration for a given AI service
 */
export function getDefaultConfigForService(serviceType: string): Record<string, any> {
  const defaults: Record<string, any> = {
    [AI_SERVICE_OPENAI]: DEFAULT_OPENAI_CONFIG,
    [AI_SERVICE_OLLAMA]: DEFAULT_OLLAMA_CONFIG,
    [AI_SERVICE_OPENROUTER]: DEFAULT_OPENROUTER_CONFIG,
    [AI_SERVICE_LMSTUDIO]: DEFAULT_LMSTUDIO_CONFIG,
    [AI_SERVICE_ANTHROPIC]: DEFAULT_ANTHROPIC_CONFIG,
    [AI_SERVICE_GEMINI]: DEFAULT_GEMINI_CONFIG,
    [AI_SERVICE_ZAI]: DEFAULT_ZAI_CONFIG,
  };
  return defaults[serviceType] || DEFAULT_OPENAI_CONFIG;
}

/**
 * Get default model for a given AI service
 */
export function getDefaultModelForService(aiService: string): string {
  const config = getDefaultConfigForService(aiService);
  return config.model || "";
}

/**
 * Get all API URLs for all services from frontmatter or settings
 * Returns a map of service type to URL
 */
export function getApiUrlsFromFrontmatter(frontmatter: any): Record<string, string> {
  const configs: Record<string, { url: string }> = {
    [AI_SERVICE_OPENAI]: DEFAULT_OPENAI_CONFIG,
    [AI_SERVICE_OPENROUTER]: DEFAULT_OPENROUTER_CONFIG,
    [AI_SERVICE_OLLAMA]: DEFAULT_OLLAMA_CONFIG,
    [AI_SERVICE_LMSTUDIO]: DEFAULT_LMSTUDIO_CONFIG,
    [AI_SERVICE_ANTHROPIC]: DEFAULT_ANTHROPIC_CONFIG,
    [AI_SERVICE_GEMINI]: DEFAULT_GEMINI_CONFIG,
    [AI_SERVICE_ZAI]: DEFAULT_ZAI_CONFIG,
  };

  const providers = [
    AI_SERVICE_OPENAI,
    AI_SERVICE_OPENROUTER,
    AI_SERVICE_OLLAMA,
    AI_SERVICE_LMSTUDIO,
    AI_SERVICE_ANTHROPIC,
    AI_SERVICE_GEMINI,
    AI_SERVICE_ZAI,
  ];

  return Object.fromEntries(
    providers.map((provider) => [provider, frontmatter[`${provider}Url`] || configs[provider].url])
  );
}

/**
 * Get API URL for a specific service from frontmatter or settings
 */
export function getApiUrlForService(serviceType: string, frontmatter: any, settings: ChatGPT_MDSettings): string {
  const urls = getApiUrlsFromFrontmatter(frontmatter);
  const settingsUrl = (settings as any)[`${serviceType}Url`];
  return urls[serviceType] || settingsUrl || urls.openai;
}

/**
 * Build model ID with provider prefix if not already present
 */
export function buildModelId(model: string, provider: string): string {
  if (model.includes("@")) {
    return model; // Already has provider prefix
  }
  return `${provider}@${model}`;
}

// Deprecated functions removed - use extractProvider and getModelName from ModelFilteringHelper directly

/**
 * Check if a model is a timestamp format (used for auto-title inference)
 */
export function isTitleTimestampFormat(title: string = "", dateFormat: string): boolean {
  if (!title || !dateFormat) return false;

  // Generate pattern from format string
  const pattern = dateFormat
    .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") // Escape special characters
    .replace("YYYY", "\\d{4}") // Match exactly four digits for the year
    .replace("MM", "\\d{2}") // Match exactly two digits for the month
    .replace("DD", "\\d{2}") // Match exactly two digits for the day
    .replace("hh", "\\d{2}") // Match exactly two digits for the hour
    .replace("mm", "\\d{2}") // Match exactly two digits for the minute
    .replace("ss", "\\d{2}"); // Match exactly two digits for the second

  const regex = new RegExp(`^${pattern}$`);
  return title.length === dateFormat.length && regex.test(title);
}
