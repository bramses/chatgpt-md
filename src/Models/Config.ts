import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import { DEFAULT_DATE_FORMAT } from "../Constants";
import { DEFAULT_OPENROUTER_CONFIG } from "src/Services/OpenRouterService";
import { DEFAULT_OLLAMA_CONFIG } from "src/Services/OllamaService";

export const DEFAULT_CHAT_FRONT_MATTER = `---
system_commands: ['I am a helpful assistant.']
temperature: ${DEFAULT_OPENAI_CONFIG.temperature}
top_p: ${DEFAULT_OPENAI_CONFIG.top_p}
max_tokens: ${DEFAULT_OPENAI_CONFIG.max_tokens}
presence_penalty: ${DEFAULT_OPENAI_CONFIG.presence_penalty}
frequency_penalty: ${DEFAULT_OPENAI_CONFIG.frequency_penalty}
stream: ${DEFAULT_OPENAI_CONFIG.stream}
stop: ${DEFAULT_OPENAI_CONFIG.stop}
n: ${DEFAULT_OPENAI_CONFIG.n}
model: ${DEFAULT_OPENAI_CONFIG.model}
---`;

/**
 * API key settings
 */
export interface ApiKeySettings {
  /** API Key for OpenAI */
  apiKey: string;
  /** API Key for OpenRouter */
  openrouterApiKey: string;
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
 * Chat template settings
 */
export interface TemplateSettings {
  /** Default frontmatter for new chat files */
  defaultChatFrontmatter: string;
  /** System commands to include in the chat */
  system_commands?: string[] | null;
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
}

/**
 * Combined settings interface
 */
export interface ChatGPT_MDSettings
  extends ApiKeySettings,
    FolderSettings,
    ChatBehaviorSettings,
    FormattingSettings,
    TemplateSettings,
    ServiceUrlSettings {}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
  // API Keys
  apiKey: "default",
  openrouterApiKey: "",

  // Service URLs
  openaiUrl: DEFAULT_OPENAI_CONFIG.url,
  openrouterUrl: DEFAULT_OPENROUTER_CONFIG.url,
  ollamaUrl: DEFAULT_OLLAMA_CONFIG.url,

  // Folders
  chatFolder: "ChatGPT_MD/chats",
  chatTemplateFolder: "ChatGPT_MD/templates",

  // Chat Behavior
  stream: true,
  generateAtCursor: false,
  autoInferTitle: false,

  // Formatting
  dateFormat: DEFAULT_DATE_FORMAT,
  headingLevel: 0,
  inferTitleLanguage: "English",

  // Templates
  defaultChatFrontmatter: DEFAULT_CHAT_FRONT_MATTER,
};
