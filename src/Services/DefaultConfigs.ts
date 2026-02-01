import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_COPILOT,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "src/Constants";

/**
 * Default configuration for OpenAI
 */
export const DEFAULT_OPENAI_CONFIG = {
  aiService: AI_SERVICE_OPENAI,
  frequency_penalty: 0,
  max_tokens: 400,
  model: "openai@gpt-4.1-mini",
  presence_penalty: 0,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://api.openai.com",
};

/**
 * Default configuration for Anthropic
 */
export const DEFAULT_ANTHROPIC_CONFIG = {
  aiService: AI_SERVICE_ANTHROPIC,
  max_tokens: 400,
  model: "anthropic@claude-sonnet-4-20250514",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://api.anthropic.com",
};

/**
 * Default configuration for Ollama
 */
export const DEFAULT_OLLAMA_CONFIG = {
  aiService: AI_SERVICE_OLLAMA,
  model: "",
  url: "http://localhost:11434",
  stream: true,
  title: "Untitled",
  system_commands: null,
  temperature: 0.7,
  top_p: 1,
};

/**
 * Default configuration for OpenRouter
 */
export const DEFAULT_OPENROUTER_CONFIG = {
  aiService: AI_SERVICE_OPENROUTER,
  frequency_penalty: 0.5,
  max_tokens: 400,
  model: "openrouter@openai/gpt-4.1-mini",
  openrouterApiKey: "",
  presence_penalty: 0.5,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://openrouter.ai",
};

/**
 * Default configuration for LM Studio
 */
export const DEFAULT_LMSTUDIO_CONFIG = {
  aiService: AI_SERVICE_LMSTUDIO,
  model: "",
  url: "http://localhost:1234",
  stream: true,
  title: "Untitled",
  system_commands: null,
  temperature: 0.7,
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
};

/**
 * Default configuration for Gemini
 */
export const DEFAULT_GEMINI_CONFIG = {
  aiService: AI_SERVICE_GEMINI,
  max_tokens: 400,
  model: "gemini@",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  top_p: 1,
  url: "https://generativelanguage.googleapis.com",
};

/**
 * Default configuration for GitHub Copilot
 */
export const DEFAULT_COPILOT_CONFIG = {
  aiService: AI_SERVICE_COPILOT,
  max_tokens: 4096,
  model: "copilot@gpt-4o",
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.7,
  title: "Untitled",
  url: "https://api.githubcopilot.com",
};
