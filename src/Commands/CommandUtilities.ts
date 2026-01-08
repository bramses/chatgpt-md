import { Notice } from "obsidian";
import { isValidApiKey } from "src/Services/ApiAuthService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { IAiApiService } from "src/Types/AiTypes";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  FETCH_MODELS_TIMEOUT_MS,
} from "src/Constants";
import { getApiUrlsFromFrontmatter } from "src/Utilities/FrontmatterHelpers";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
} from "src/Services/DefaultConfigs";

/**
 * Get the API URLs for all AI services based on frontmatter
 * Delegates to FrontmatterHelpers utility
 */
export function getAiApiUrls(frontmatter: any): { [key: string]: string } {
  return getApiUrlsFromFrontmatter(frontmatter);
}

/**
 * Get default API URLs for all services from settings
 */
export function getDefaultApiUrls(settings: ChatGPT_MDSettings): { [key: string]: string } {
  return {
    [AI_SERVICE_OPENAI]: settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
    [AI_SERVICE_OPENROUTER]: settings.openrouterUrl || DEFAULT_OPENROUTER_CONFIG.url,
    [AI_SERVICE_OLLAMA]: settings.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url,
    [AI_SERVICE_LMSTUDIO]: settings.lmstudioUrl || DEFAULT_LMSTUDIO_CONFIG.url,
    [AI_SERVICE_ANTHROPIC]: settings.anthropicUrl || DEFAULT_ANTHROPIC_CONFIG.url,
    [AI_SERVICE_GEMINI]: settings.geminiUrl || DEFAULT_GEMINI_CONFIG.url,
  };
}

/**
 * Fetch available models from all services
 */
export async function fetchAvailableModels(
  aiService: IAiApiService,
  urls: { [key: string]: string },
  apiKey: string,
  openrouterApiKey: string,
  apiAuthService: { getApiKey(settings: ChatGPT_MDSettings, serviceType: string): string },
  settingsService: { getSettings(): ChatGPT_MDSettings }
): Promise<string[]> {
  function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
  }

  try {
    const promises: Promise<string[]>[] = [];

    // Add Ollama promise (always fetched)
    promises.push(
      withTimeout(
        aiService.fetchAvailableModels(urls[AI_SERVICE_OLLAMA], undefined, settingsService.getSettings(), "ollama"),
        FETCH_MODELS_TIMEOUT_MS,
        []
      )
    );

    // Add LM Studio promise (always fetched, no API key required)
    promises.push(
      withTimeout(
        aiService.fetchAvailableModels(urls[AI_SERVICE_LMSTUDIO], undefined, settingsService.getSettings(), "lmstudio"),
        FETCH_MODELS_TIMEOUT_MS,
        []
      )
    );

    // Conditionally add OpenAI promise
    if (isValidApiKey(apiKey)) {
      promises.push(
        withTimeout(
          aiService.fetchAvailableModels(urls[AI_SERVICE_OPENAI], apiKey, settingsService.getSettings(), "openai"),
          FETCH_MODELS_TIMEOUT_MS,
          []
        )
      );
    }

    // Conditionally add OpenRouter promise
    if (isValidApiKey(openrouterApiKey)) {
      promises.push(
        withTimeout(
          aiService.fetchAvailableModels(
            urls[AI_SERVICE_OPENROUTER],
            openrouterApiKey,
            settingsService.getSettings(),
            "openrouter"
          ),
          FETCH_MODELS_TIMEOUT_MS,
          []
        )
      );
    }

    // Conditionally add Anthropic promise
    const anthropicApiKey = apiAuthService.getApiKey(settingsService.getSettings(), AI_SERVICE_ANTHROPIC);
    if (isValidApiKey(anthropicApiKey)) {
      promises.push(
        withTimeout(
          aiService.fetchAvailableModels(
            urls[AI_SERVICE_ANTHROPIC],
            anthropicApiKey,
            settingsService.getSettings(),
            "anthropic"
          ),
          FETCH_MODELS_TIMEOUT_MS,
          []
        )
      );
    }

    // Conditionally add Gemini promise
    const geminiApiKey = apiAuthService.getApiKey(settingsService.getSettings(), AI_SERVICE_GEMINI);
    if (isValidApiKey(geminiApiKey)) {
      promises.push(
        withTimeout(
          aiService.fetchAvailableModels(
            urls[AI_SERVICE_GEMINI],
            geminiApiKey,
            settingsService.getSettings(),
            "gemini"
          ),
          FETCH_MODELS_TIMEOUT_MS,
          []
        )
      );
    }

    // Fetch all models in parallel and flatten the results
    const results = await Promise.all(promises);
    return results.flat();
  } catch (error) {
    // Handle potential errors during fetch or Promise.all
    new Notice("Error fetching models: " + (error instanceof Error ? error.message : String(error)));
    console.error("Error fetching models:", error);
    // Depending on desired behavior, you might return [] or rethrow
    return []; // Return empty array on error to avoid breaking the modal
  }
}
