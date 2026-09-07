import { ChatGPT_MDSettings } from "src/Models/Config";
import {
  AI_SERVICE_ATLASCLOUD,
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  AI_SERVICE_ZAI,
  AiServiceType,
} from "src/Constants";
import {
  DEFAULT_ATLASCLOUD_CONFIG,
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
  DEFAULT_ZAI_CONFIG,
} from "src/Services/DefaultConfigs";
import { ProviderAdapter } from "src/Services/Adapters/ProviderAdapter";
import { ProviderFactory } from "src/Types/ProviderTypes";
import { OpenAIAdapter } from "src/Services/Adapters/OpenAIAdapter";
import { AtlasCloudAdapter } from "src/Services/Adapters/AtlasCloudAdapter";
import { AnthropicAdapter } from "src/Services/Adapters/AnthropicAdapter";
import { GeminiAdapter } from "src/Services/Adapters/GeminiAdapter";
import { LmStudioAdapter } from "src/Services/Adapters/LmStudioAdapter";
import { OllamaAdapter } from "src/Services/Adapters/OllamaAdapter";
import { OpenRouterAdapter } from "src/Services/Adapters/OpenRouterAdapter";
import { ZaiAdapter } from "src/Services/Adapters/ZaiAdapter";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export type ApiKeySettingKey =
  "apiKey" | "atlascloudApiKey" | "openrouterApiKey" | "anthropicApiKey" | "geminiApiKey" | "zaiApiKey";
export type SecretIdSettingKey =
  | "apiKeySecretId"
  | "atlascloudApiKeySecretId"
  | "openrouterApiKeySecretId"
  | "anthropicApiKeySecretId"
  | "geminiApiKeySecretId"
  | "zaiApiKeySecretId"
  | "webSearchApiKeySecretId";

export interface CredentialDefinition {
  category: "openai" | "atlascloud" | "openrouter" | "anthropic" | "gemini" | "zai" | "web-search";
  legacySetting: ApiKeySettingKey | "webSearchApiKey";
  secretIdSetting: SecretIdSettingKey;
  ownedSecretId: string;
  label: string;
}

export type UrlSettingKey =
  | "openaiUrl"
  | "atlascloudUrl"
  | "openrouterUrl"
  | "ollamaUrl"
  | "lmstudioUrl"
  | "anthropicUrl"
  | "geminiUrl"
  | "zaiUrl";

export interface ProviderDefinition {
  id: AiServiceType;
  label: string;
  requiresApiKey: boolean;
  local: boolean;
  apiKeySetting?: ApiKeySettingKey;
  credential?: CredentialDefinition;
  urlSetting: UrlSettingKey;
  defaultUrl: string;
  defaultConfig: Record<string, unknown>;
  createAdapter: () => ProviderAdapter;
  createProviderFactory: (baseUrl?: string) => ProviderFactory;
  getFrontmatterFields: (settings: ChatGPT_MDSettings) => Record<string, unknown>;
}

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    id: AI_SERVICE_OLLAMA,
    label: "Ollama",
    requiresApiKey: false,
    local: true,
    urlSetting: "ollamaUrl",
    defaultUrl: DEFAULT_OLLAMA_CONFIG.url,
    defaultConfig: DEFAULT_OLLAMA_CONFIG,
    createAdapter: () => new OllamaAdapter(),
    createProviderFactory: () => createOpenAICompatible,
    getFrontmatterFields: (settings) => ({
      url: settings.ollamaUrl,
      temperature: settings.ollamaDefaultTemperature,
      top_p: settings.ollamaDefaultTopP,
    }),
  },
  {
    id: AI_SERVICE_OPENAI,
    label: "OpenAI",
    requiresApiKey: true,
    local: false,
    apiKeySetting: "apiKey",
    credential: {
      category: "openai",
      legacySetting: "apiKey",
      secretIdSetting: "apiKeySecretId",
      ownedSecretId: "chatgpt-md-openai-api-key",
      label: "OpenAI",
    },
    urlSetting: "openaiUrl",
    defaultUrl: DEFAULT_OPENAI_CONFIG.url,
    defaultConfig: DEFAULT_OPENAI_CONFIG,
    createAdapter: () => new OpenAIAdapter(),
    createProviderFactory: () => createOpenAI,
    getFrontmatterFields: (settings) => ({
      model: settings.openaiDefaultModel,
      temperature: settings.openaiDefaultTemperature,
      top_p: settings.openaiDefaultTopP,
      max_tokens: settings.openaiDefaultMaxTokens,
      presence_penalty: settings.openaiDefaultPresencePenalty,
      frequency_penalty: settings.openaiDefaultFrequencyPenalty,
    }),
  },
  {
    id: AI_SERVICE_ATLASCLOUD,
    label: "Atlas Cloud",
    requiresApiKey: true,
    local: false,
    apiKeySetting: "atlascloudApiKey",
    credential: {
      category: "atlascloud",
      legacySetting: "atlascloudApiKey",
      secretIdSetting: "atlascloudApiKeySecretId",
      ownedSecretId: "chatgpt-md-atlascloud-api-key",
      label: "Atlas Cloud",
    },
    urlSetting: "atlascloudUrl",
    defaultUrl: DEFAULT_ATLASCLOUD_CONFIG.url,
    defaultConfig: DEFAULT_ATLASCLOUD_CONFIG,
    createAdapter: () => new AtlasCloudAdapter(),
    createProviderFactory: () => createOpenAICompatible,
    getFrontmatterFields: (settings) => ({
      model: settings.atlascloudDefaultModel,
      temperature: settings.atlascloudDefaultTemperature,
      top_p: settings.atlascloudDefaultTopP,
      max_tokens: settings.atlascloudDefaultMaxTokens,
      presence_penalty: settings.atlascloudDefaultPresencePenalty,
      frequency_penalty: settings.atlascloudDefaultFrequencyPenalty,
    }),
  },
  {
    id: AI_SERVICE_OPENROUTER,
    label: "OpenRouter",
    requiresApiKey: true,
    local: false,
    apiKeySetting: "openrouterApiKey",
    credential: {
      category: "openrouter",
      legacySetting: "openrouterApiKey",
      secretIdSetting: "openrouterApiKeySecretId",
      ownedSecretId: "chatgpt-md-openrouter-api-key",
      label: "OpenRouter",
    },
    urlSetting: "openrouterUrl",
    defaultUrl: DEFAULT_OPENROUTER_CONFIG.url,
    defaultConfig: DEFAULT_OPENROUTER_CONFIG,
    createAdapter: () => new OpenRouterAdapter(),
    createProviderFactory: () => createOpenRouter,
    getFrontmatterFields: (settings) => ({
      model: settings.openrouterDefaultModel,
      temperature: settings.openrouterDefaultTemperature,
      top_p: settings.openrouterDefaultTopP,
      max_tokens: settings.openrouterDefaultMaxTokens,
      presence_penalty: settings.openrouterDefaultPresencePenalty,
      frequency_penalty: settings.openrouterDefaultFrequencyPenalty,
    }),
  },
  {
    id: AI_SERVICE_LMSTUDIO,
    label: "LM Studio",
    requiresApiKey: false,
    local: true,
    urlSetting: "lmstudioUrl",
    defaultUrl: DEFAULT_LMSTUDIO_CONFIG.url,
    defaultConfig: DEFAULT_LMSTUDIO_CONFIG,
    createAdapter: () => new LmStudioAdapter(),
    createProviderFactory: () => createOpenAICompatible,
    getFrontmatterFields: (settings) => ({
      url: settings.lmstudioUrl,
      temperature: settings.lmstudioDefaultTemperature,
      top_p: settings.lmstudioDefaultTopP,
      presence_penalty: settings.lmstudioDefaultPresencePenalty,
      frequency_penalty: settings.lmstudioDefaultFrequencyPenalty,
    }),
  },
  {
    id: AI_SERVICE_ANTHROPIC,
    label: "Anthropic",
    requiresApiKey: true,
    local: false,
    apiKeySetting: "anthropicApiKey",
    credential: {
      category: "anthropic",
      legacySetting: "anthropicApiKey",
      secretIdSetting: "anthropicApiKeySecretId",
      ownedSecretId: "chatgpt-md-anthropic-api-key",
      label: "Anthropic",
    },
    urlSetting: "anthropicUrl",
    defaultUrl: DEFAULT_ANTHROPIC_CONFIG.url,
    defaultConfig: DEFAULT_ANTHROPIC_CONFIG,
    createAdapter: () => new AnthropicAdapter(),
    createProviderFactory: () => createAnthropic,
    getFrontmatterFields: (settings) => ({
      model: settings.anthropicDefaultModel,
      url: settings.anthropicUrl,
      temperature: settings.anthropicDefaultTemperature,
      max_tokens: settings.anthropicDefaultMaxTokens,
    }),
  },
  {
    id: AI_SERVICE_GEMINI,
    label: "Gemini",
    requiresApiKey: true,
    local: false,
    apiKeySetting: "geminiApiKey",
    credential: {
      category: "gemini",
      legacySetting: "geminiApiKey",
      secretIdSetting: "geminiApiKeySecretId",
      ownedSecretId: "chatgpt-md-gemini-api-key",
      label: "Gemini",
    },
    urlSetting: "geminiUrl",
    defaultUrl: DEFAULT_GEMINI_CONFIG.url,
    defaultConfig: DEFAULT_GEMINI_CONFIG,
    createAdapter: () => new GeminiAdapter(),
    createProviderFactory: () => createGoogleGenerativeAI,
    getFrontmatterFields: (settings) => ({
      model: settings.geminiDefaultModel,
      url: settings.geminiUrl,
      temperature: settings.geminiDefaultTemperature,
      top_p: settings.geminiDefaultTopP,
      max_tokens: settings.geminiDefaultMaxTokens,
    }),
  },
  {
    id: AI_SERVICE_ZAI,
    label: "Z.AI",
    requiresApiKey: true,
    local: false,
    apiKeySetting: "zaiApiKey",
    credential: {
      category: "zai",
      legacySetting: "zaiApiKey",
      secretIdSetting: "zaiApiKeySecretId",
      ownedSecretId: "chatgpt-md-zai-api-key",
      label: "Z.AI",
    },
    urlSetting: "zaiUrl",
    defaultUrl: DEFAULT_ZAI_CONFIG.url,
    defaultConfig: DEFAULT_ZAI_CONFIG,
    createAdapter: () => new ZaiAdapter(),
    createProviderFactory: (baseUrl) =>
      baseUrl?.includes("/api/anthropic") ? createAnthropic : createOpenAICompatible,
    getFrontmatterFields: (settings) => ({
      model: settings.zaiDefaultModel,
      url: settings.zaiUrl,
      temperature: settings.zaiDefaultTemperature,
      max_tokens: settings.zaiDefaultMaxTokens,
    }),
  },
] as const;

export const WEB_SEARCH_CREDENTIAL: CredentialDefinition = {
  category: "web-search",
  legacySetting: "webSearchApiKey",
  secretIdSetting: "webSearchApiKeySecretId",
  ownedSecretId: "chatgpt-md-web-search-api-key",
  label: "Web search",
};

export function getCredentialDefinitions(): readonly CredentialDefinition[] {
  return [
    ...PROVIDER_DEFINITIONS.flatMap((provider) => (provider.credential ? [provider.credential] : [])),
    WEB_SEARCH_CREDENTIAL,
  ];
}

export function getProviderDefinitions(): readonly ProviderDefinition[] {
  return PROVIDER_DEFINITIONS;
}

export function findProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((provider) => provider.id === providerId);
}

export function getProviderDefinition(providerId: AiServiceType): ProviderDefinition {
  const definition = findProviderDefinition(providerId);
  if (!definition) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  return definition;
}

export function createProviderAdapters(): Map<AiServiceType, ProviderAdapter> {
  return new Map(PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider.createAdapter()]));
}

export function getProviderApiKey(settings: ChatGPT_MDSettings, provider: ProviderDefinition): string | undefined {
  return provider.apiKeySetting ? settings[provider.apiKeySetting] : undefined;
}

export function getProviderUrl(settings: ChatGPT_MDSettings, provider: ProviderDefinition): string {
  return settings[provider.urlSetting] || provider.defaultUrl;
}

export function getProviderFrontmatterFields(
  providerId: string,
  settings: ChatGPT_MDSettings
): Record<string, unknown> {
  return findProviderDefinition(providerId)?.getFrontmatterFields(settings) || {};
}

export function getProviderFactory(providerId: AiServiceType, baseUrl?: string): ProviderFactory {
  return getProviderDefinition(providerId).createProviderFactory(baseUrl);
}
