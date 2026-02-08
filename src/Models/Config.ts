import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_HEADING_LEVEL,
  DEFAULT_INFER_TITLE_LANGUAGE,
  PLUGIN_SYSTEM_MESSAGE,
} from "../Constants";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
  DEFAULT_ZAI_CONFIG,
} from "src/Services/DefaultConfigs";
import { getDefaultToolWhitelist } from "src/Services/ToolSupportDetector";

/**
 * Generate default chat front matter using service provider defaults
 */
const generateDefaultChatFrontMatter = (): string => {
  return `---
system_commands: ['You are a helpful assistant.']
frequency_penalty: ${DEFAULT_OPENAI_CONFIG.frequency_penalty}
max_tokens: ${DEFAULT_OPENAI_CONFIG.max_tokens}
model: ${DEFAULT_OPENAI_CONFIG.model}
presence_penalty: ${DEFAULT_OPENAI_CONFIG.presence_penalty}
stream: true
temperature: ${DEFAULT_OPENAI_CONFIG.temperature}
---`;
};

/**
 * API key settings
 *
 * All fields are actively used by ApiAuthService for provider authentication.
 * See src/Services/ApiAuthService.ts::getApiKey() for usage.
 *
 * - apiKey: Used for OpenAI API authentication (Bearer token)
 * - openrouterApiKey: Used for OpenRouter API authentication
 * - anthropicApiKey: Used for Anthropic API authentication (x-api-key header)
 * - geminiApiKey: Used for Gemini API authentication (x-goog-api-key header)
 */
export interface ApiKeySettings {
  /** API Key for OpenAI - used for OpenAI API calls */
  apiKey: string;
  /** API Key for OpenRouter - used for OpenRouter proxy API calls */
  openrouterApiKey: string;
  /** API Key for Anthropic - used for Claude models via Anthropic API */
  anthropicApiKey: string;
  /** API Key for Gemini - used for Google Gemini models */
  geminiApiKey: string;
  /** API Key for Z.AI - used for GLM models (both Standard API and Coding Plan) */
  zaiApiKey: string;
}

/**
 * Folder settings
 */
export interface FolderSettings {
  /** Path to folder for chat files */
  chatFolder: string;
  /** Path to folder for chat file templates */
  chatTemplateFolder: string;
}

/**
 * Chat behavior settings
 */
export interface ChatBehaviorSettings {
  /** Whether to stream responses from the AI */
  stream: boolean;
  /** Whether to generate text at cursor instead of end of file */
  generateAtCursor: boolean;
  /** Whether to automatically infer title after 4 messages have been exchanged */
  autoInferTitle: boolean;
  /** Whether to enable AI tool calling (vault search, file read) */
  enableToolCalling: boolean;
  /** Whitelist of model patterns that can use tools - supports wildcards like gpt-4* */
  toolEnabledModels: string;
  /** Enable debug mode for detailed logging */
  debugMode: boolean;
  /** System message that provides context about the Obsidian/ChatGPT MD plugin environment */
  pluginSystemMessage: string;
}

/**
 * Formatting settings
 */
export interface FormattingSettings {
  /** Date format for chat files */
  dateFormat: string;
  /** Heading level for messages */
  headingLevel: number;
  /** Language to use for title inference */
  inferTitleLanguage: string;
}

/**
 * Provider-specific frontmatter settings for OpenAI
 */
export interface OpenAIFrontmatterSettings {
  openaiDefaultModel: string;
  openaiDefaultTemperature: number;
  openaiDefaultTopP: number;
  openaiDefaultMaxTokens: number;
  openaiDefaultPresencePenalty: number;
  openaiDefaultFrequencyPenalty: number;
}

/**
 * Provider-specific frontmatter settings for Anthropic
 */
export interface AnthropicFrontmatterSettings {
  anthropicDefaultModel: string;
  anthropicDefaultTemperature: number;
  anthropicDefaultMaxTokens: number;
}

/**
 * Provider-specific frontmatter settings for Gemini
 */
export interface GeminiFrontmatterSettings {
  geminiDefaultModel: string;
  geminiDefaultTemperature: number;
  geminiDefaultTopP: number;
  geminiDefaultMaxTokens: number;
}

/**
 * Provider-specific frontmatter settings for OpenRouter
 */
export interface OpenRouterFrontmatterSettings {
  openrouterDefaultModel: string;
  openrouterDefaultTemperature: number;
  openrouterDefaultTopP: number;
  openrouterDefaultMaxTokens: number;
  openrouterDefaultPresencePenalty: number;
  openrouterDefaultFrequencyPenalty: number;
}

/**
 * Provider-specific frontmatter settings for Ollama
 */
export interface OllamaFrontmatterSettings {
  ollamaDefaultTemperature?: number;
  ollamaDefaultTopP?: number;
}

/**
 * Provider-specific frontmatter settings for LM Studio
 */
export interface LmStudioFrontmatterSettings {
  lmstudioDefaultTemperature: number;
  lmstudioDefaultTopP: number;
  lmstudioDefaultPresencePenalty: number;
  lmstudioDefaultFrequencyPenalty: number;
}

/**
 * Provider-specific frontmatter settings for Z.AI
 */
export interface ZaiFrontmatterSettings {
  /** Default model for Z.AI chats */
  zaiDefaultModel: string;
  /** Default temperature for Z.AI chats */
  zaiDefaultTemperature: number;
  /** Default max tokens for Z.AI chats */
  zaiDefaultMaxTokens: number;
}

/**
 * Chat template settings
 */
export interface TemplateSettings {
  /** Default frontmatter for new chat files */
  defaultChatFrontmatter: string;
}

/**
 * Service URL settings
 */
export interface ServiceUrlSettings {
  /** URL for OpenAI API */
  openaiUrl: string;
  /** URL for OpenRouter API */
  openrouterUrl: string;
  /** URL for Ollama API */
  ollamaUrl: string;
  /** URL for LM Studio API */
  lmstudioUrl: string;
  /** URL for Anthropic API */
  anthropicUrl: string;
  /** URL for Gemini API */
  geminiUrl: string;
  /** URL for Z.AI API (Standard: /api/paas/v4, Coding Plan: /api/anthropic) */
  zaiUrl: string;
}

/**
 * Web search settings
 */
export interface WebSearchSettings {
  /** Search provider ('brave' | 'custom') */
  webSearchProvider: "brave" | "custom";
  /** API key for providers that require it */
  webSearchApiKey?: string;
  /** Custom search API endpoint */
  webSearchApiUrl?: string;
  /** Maximum results to return */
  maxWebSearchResults: number;
}

/**
 * Combined settings interface
 */
export interface ChatGPT_MDSettings
  extends
    ApiKeySettings,
    FolderSettings,
    ChatBehaviorSettings,
    FormattingSettings,
    TemplateSettings,
    ServiceUrlSettings,
    WebSearchSettings,
    OpenAIFrontmatterSettings,
    AnthropicFrontmatterSettings,
    GeminiFrontmatterSettings,
    OpenRouterFrontmatterSettings,
    OllamaFrontmatterSettings,
    LmStudioFrontmatterSettings,
    ZaiFrontmatterSettings {}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
  // API Keys
  apiKey: "",
  openrouterApiKey: "",
  anthropicApiKey: "",
  geminiApiKey: "",
  zaiApiKey: "",

  // Service URLs
  openaiUrl: DEFAULT_OPENAI_CONFIG.url,
  openrouterUrl: DEFAULT_OPENROUTER_CONFIG.url,
  ollamaUrl: DEFAULT_OLLAMA_CONFIG.url,
  lmstudioUrl: DEFAULT_LMSTUDIO_CONFIG.url,
  anthropicUrl: DEFAULT_ANTHROPIC_CONFIG.url,
  geminiUrl: DEFAULT_GEMINI_CONFIG.url,
  zaiUrl: DEFAULT_ZAI_CONFIG.url,

  // Folders
  chatFolder: "ChatGPT_MD/chats",
  chatTemplateFolder: "ChatGPT_MD/templates",

  // Chat Behavior
  stream: true,
  generateAtCursor: false,
  autoInferTitle: false,
  enableToolCalling: false,
  toolEnabledModels: getDefaultToolWhitelist(),
  debugMode: false,
  pluginSystemMessage: PLUGIN_SYSTEM_MESSAGE,

  // Web Search
  webSearchProvider: "brave",
  webSearchApiKey: "",
  webSearchApiUrl: "",
  maxWebSearchResults: 5,

  // Formatting
  dateFormat: DEFAULT_DATE_FORMAT,
  headingLevel: DEFAULT_HEADING_LEVEL,
  inferTitleLanguage: DEFAULT_INFER_TITLE_LANGUAGE,

  // Templates
  defaultChatFrontmatter: generateDefaultChatFrontMatter(),

  // OpenAI Defaults
  openaiDefaultModel: DEFAULT_OPENAI_CONFIG.model,
  openaiDefaultTemperature: DEFAULT_OPENAI_CONFIG.temperature,
  openaiDefaultTopP: DEFAULT_OPENAI_CONFIG.top_p,
  openaiDefaultMaxTokens: DEFAULT_OPENAI_CONFIG.max_tokens,
  openaiDefaultPresencePenalty: DEFAULT_OPENAI_CONFIG.presence_penalty,
  openaiDefaultFrequencyPenalty: DEFAULT_OPENAI_CONFIG.frequency_penalty,

  // Anthropic Defaults
  anthropicDefaultModel: DEFAULT_ANTHROPIC_CONFIG.model,
  anthropicDefaultTemperature: DEFAULT_ANTHROPIC_CONFIG.temperature,
  anthropicDefaultMaxTokens: DEFAULT_ANTHROPIC_CONFIG.max_tokens,

  // Gemini Defaults
  geminiDefaultModel: DEFAULT_GEMINI_CONFIG.model,
  geminiDefaultTemperature: DEFAULT_GEMINI_CONFIG.temperature,
  geminiDefaultTopP: DEFAULT_GEMINI_CONFIG.top_p,
  geminiDefaultMaxTokens: DEFAULT_GEMINI_CONFIG.max_tokens,

  // OpenRouter Defaults
  openrouterDefaultModel: DEFAULT_OPENROUTER_CONFIG.model,
  openrouterDefaultTemperature: DEFAULT_OPENROUTER_CONFIG.temperature,
  openrouterDefaultTopP: DEFAULT_OPENROUTER_CONFIG.top_p,
  openrouterDefaultMaxTokens: DEFAULT_OPENROUTER_CONFIG.max_tokens,
  openrouterDefaultPresencePenalty: DEFAULT_OPENROUTER_CONFIG.presence_penalty,
  openrouterDefaultFrequencyPenalty: DEFAULT_OPENROUTER_CONFIG.frequency_penalty,

  // Ollama Defaults (no default model - user must configure)
  ollamaDefaultTemperature: 0.7,
  ollamaDefaultTopP: 1,

  // LM Studio Defaults (no default model - user must configure)
  lmstudioDefaultTemperature: DEFAULT_LMSTUDIO_CONFIG.temperature,
  lmstudioDefaultTopP: DEFAULT_LMSTUDIO_CONFIG.top_p,
  lmstudioDefaultPresencePenalty: DEFAULT_LMSTUDIO_CONFIG.presence_penalty,
  lmstudioDefaultFrequencyPenalty: DEFAULT_LMSTUDIO_CONFIG.frequency_penalty,

  // Z.AI Defaults
  zaiDefaultModel: DEFAULT_ZAI_CONFIG.model,
  zaiDefaultTemperature: DEFAULT_ZAI_CONFIG.temperature,
  zaiDefaultMaxTokens: DEFAULT_ZAI_CONFIG.max_tokens,
};
