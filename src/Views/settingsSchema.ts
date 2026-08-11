import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_DATE_FORMAT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import { getProviderDefinitions } from "src/Services/Providers/ProviderRegistry";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
  DEFAULT_ORCAROUTER_CONFIG,
  DEFAULT_ZAI_CONFIG,
} from "src/Services/DefaultConfigs";

export interface SettingDefinition {
  id: keyof ChatGPT_MDSettings;
  name: string;
  description: string;
  type: "text" | "textarea" | "toggle" | "dropdown" | "credential";
  valueType?: "string" | "number";
  secretIdSetting?: keyof ChatGPT_MDSettings;
  placeholder?: string;
  options?: Record<string, string>;
  group: string;
}

export const COLLAPSIBLE_GROUPS = getProviderDefinitions().map((provider) =>
  provider.local ? `${provider.label} (Local)` : provider.label
);

function numericProviderSettings(
  group: string,
  fields: Array<[keyof ChatGPT_MDSettings, string, string]>
): SettingDefinition[] {
  return fields.map(([id, name, placeholder]) => ({
    id,
    name: `Default ${name}`,
    description: `Default ${name.toLowerCase()} for ${group.replace(" (Local)", "")} chats`,
    type: "text",
    valueType: "number",
    placeholder,
    group,
  }));
}

const SETTINGS_SCHEMA: SettingDefinition[] = [
  // API Keys
  {
    id: "apiKey",
    name: "OpenAI API Key",
    description: "API Key for OpenAI",
    type: "credential",
    secretIdSetting: "apiKeySecretId",
    placeholder: "your openAI API Key",
    group: "API Keys",
  },
  {
    id: "openrouterApiKey",
    name: "OpenRouter.ai API Key",
    description: "API Key for OpenRouter.ai",
    type: "credential",
    secretIdSetting: "openrouterApiKeySecretId",
    placeholder: "your openRouter API Key",
    group: "API Keys",
  },
  {
    id: "anthropicApiKey",
    name: "Anthropic API Key",
    description: "API Key for Anthropic (Claude)",
    type: "credential",
    secretIdSetting: "anthropicApiKeySecretId",
    placeholder: "your Anthropic API Key",
    group: "API Keys",
  },
  {
    id: "geminiApiKey",
    name: "Gemini API Key",
    description: "API Key for Google Gemini (Google AI Studio)",
    type: "credential",
    secretIdSetting: "geminiApiKeySecretId",
    placeholder: "your Gemini API Key",
    group: "API Keys",
  },
  {
    id: "zaiApiKey",
    name: "Z.AI API Key",
    description:
      "API Key for Z.AI (GLM models). Works with both Standard API and Coding Plan. Get your key at https://z.ai",
    type: "credential",
    secretIdSetting: "zaiApiKeySecretId",
    placeholder: "your Z.AI API Key",
    group: "API Keys",
  },
  {
    id: "orcarouterApiKey",
    name: "OrcaRouter API Key",
    description: "API Key for OrcaRouter. Get your key at https://www.orcarouter.ai",
    type: "credential",
    secretIdSetting: "orcarouterApiKeySecretId",
    placeholder: "sk-orca-...",
    group: "API Keys",
  },

  // Chat Behavior
  {
    id: "defaultChatFrontmatter",
    name: "Default Chat Frontmatter",
    description:
      "Default frontmatter for new chat files. You can change/use all of the settings exposed by the OpenAI API here: https://platform.openai.com/docs/api-reference/chat/create",
    type: "textarea",
    placeholder: "",
    group: "Chat Behavior",
  },
  {
    id: "pluginSystemMessage",
    name: "Plugin System Message",
    description:
      "System message that provides context about the Obsidian/ChatGPT MD plugin environment. This helps the AI understand it's working within Obsidian and format responses appropriately.",
    type: "textarea",
    group: "Chat Behavior",
  },
  {
    id: "stream",
    name: "Stream",
    description: "Stream responses from OpenAI",
    type: "toggle",
    group: "Chat Behavior",
  },
  {
    id: "generateAtCursor",
    name: "Generate at Cursor",
    description: "Generate text at cursor instead of end of file",
    type: "toggle",
    group: "Chat Behavior",
  },
  {
    id: "autoInferTitle",
    name: "Automatically Infer Title",
    description: "Automatically infer title after 4 messages have been exchanged",
    type: "toggle",
    group: "Chat Behavior",
  },
  {
    id: "inferTitleLanguage",
    name: "Infer Title Language",
    description: "Language to use for title inference.",
    type: "dropdown",
    options: {
      English: "English",
      Japanese: "Japanese",
      Spanish: "Spanish",
      French: "French",
      German: "German",
      Chinese: "Chinese",
      Korean: "Korean",
      Italian: "Italian",
      Russian: "Russian",
    },
    group: "Chat Behavior",
  },

  // OpenAI Defaults
  {
    id: "openaiUrl",
    name: "API URL",
    description: `URL for OpenAI API\nDefault URL: ${DEFAULT_OPENAI_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_OPENAI_CONFIG.url,
    group: "OpenAI",
  },
  {
    id: "openaiDefaultModel",
    name: "Default Model",
    description: "Default model for OpenAI chats",
    type: "text",
    placeholder: "openai@gpt-4",
    group: "OpenAI",
  },
  {
    id: "openaiDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for OpenAI chats (0.0 to 2.0)",
    type: "text",
    placeholder: "0.7",
    group: "OpenAI",
  },
  {
    id: "openaiDefaultMaxTokens",
    valueType: "number",
    name: "Default Max Tokens",
    description: "Default max tokens for OpenAI chats",
    type: "text",
    placeholder: "400",
    group: "OpenAI",
  },
  ...numericProviderSettings("OpenAI", [
    ["openaiDefaultTopP", "Top P", "1"],
    ["openaiDefaultPresencePenalty", "Presence Penalty", "0"],
    ["openaiDefaultFrequencyPenalty", "Frequency Penalty", "0"],
  ]),

  // Anthropic Defaults
  {
    id: "anthropicUrl",
    name: "API URL",
    description: `URL for Anthropic API\nDefault URL: ${DEFAULT_ANTHROPIC_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_ANTHROPIC_CONFIG.url,
    group: "Anthropic",
  },
  {
    id: "anthropicDefaultModel",
    name: "Default Model",
    description: "Default model for Anthropic chats",
    type: "text",
    placeholder: "anthropic@claude-3-5-sonnet-20241022",
    group: "Anthropic",
  },
  {
    id: "anthropicDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for Anthropic chats (0.0 to 1.0)",
    type: "text",
    placeholder: "0.7",
    group: "Anthropic",
  },
  {
    id: "anthropicDefaultMaxTokens",
    valueType: "number",
    name: "Default Max Tokens",
    description: "Default max tokens for Anthropic chats",
    type: "text",
    placeholder: "400",
    group: "Anthropic",
  },

  // Gemini Defaults
  {
    id: "geminiUrl",
    name: "API URL",
    description: `URL for Gemini API\nDefault URL: ${DEFAULT_GEMINI_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_GEMINI_CONFIG.url,
    group: "Gemini",
  },
  {
    id: "geminiDefaultModel",
    name: "Default Model",
    description: "Default model for Gemini chats",
    type: "text",
    placeholder: "gemini@gemini-1.5-pro",
    group: "Gemini",
  },
  {
    id: "geminiDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for Gemini chats (0.0 to 2.0)",
    type: "text",
    placeholder: "0.7",
    group: "Gemini",
  },
  {
    id: "geminiDefaultMaxTokens",
    valueType: "number",
    name: "Default Max Tokens",
    description: "Default max tokens for Gemini chats",
    type: "text",
    placeholder: "400",
    group: "Gemini",
  },
  ...numericProviderSettings("Gemini", [["geminiDefaultTopP", "Top P", "1"]]),

  // OpenRouter Defaults
  {
    id: "openrouterUrl",
    name: "API URL",
    description: `URL for OpenRouter.ai API\nDefault URL: ${DEFAULT_OPENROUTER_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_OPENROUTER_CONFIG.url,
    group: "OpenRouter",
  },
  {
    id: "openrouterDefaultModel",
    name: "Default Model",
    description: "Default model for OpenRouter chats",
    type: "text",
    placeholder: "openrouter@anthropic/claude-3.5-sonnet",
    group: "OpenRouter",
  },
  {
    id: "openrouterDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for OpenRouter chats (0.0 to 2.0)",
    type: "text",
    placeholder: "0.7",
    group: "OpenRouter",
  },
  {
    id: "openrouterDefaultMaxTokens",
    valueType: "number",
    name: "Default Max Tokens",
    description: "Default max tokens for OpenRouter chats",
    type: "text",
    placeholder: "400",
    group: "OpenRouter",
  },
  ...numericProviderSettings("OpenRouter", [
    ["openrouterDefaultTopP", "Top P", "1"],
    ["openrouterDefaultPresencePenalty", "Presence Penalty", "0.5"],
    ["openrouterDefaultFrequencyPenalty", "Frequency Penalty", "0.5"],
  ]),

  // Z.AI Defaults
  {
    id: "zaiUrl",
    name: "API URL",
    description: `URL for Z.AI API. Two modes available:\n• Standard API (pay-per-token): https://api.z.ai/api/paas/v4\n• Coding Plan (subscription): https://api.z.ai/api/anthropic\n\nDefault: https://api.z.ai (uses Standard API mode)`,
    type: "text",
    placeholder: DEFAULT_ZAI_CONFIG.url,
    group: "Z.AI",
  },
  {
    id: "zaiDefaultModel",
    name: "Default Model",
    description: "Default model for Z.AI chats (e.g., zai@glm-4.7)",
    type: "text",
    placeholder: DEFAULT_ZAI_CONFIG.model,
    group: "Z.AI",
  },
  {
    id: "zaiDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for Z.AI chats (0.0 to 1.0)",
    type: "text",
    placeholder: "0.7",
    group: "Z.AI",
  },
  {
    id: "zaiDefaultMaxTokens",
    valueType: "number",
    name: "Default Max Tokens",
    description: "Default max tokens for Z.AI chats",
    type: "text",
    placeholder: "400",
    group: "Z.AI",
  },

  // OrcaRouter Defaults
  {
    id: "orcarouterUrl",
    name: "API URL",
    description: `URL for OrcaRouter API\nDefault URL: ${DEFAULT_ORCAROUTER_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_ORCAROUTER_CONFIG.url,
    group: "OrcaRouter",
  },
  {
    id: "orcarouterDefaultModel",
    name: "Default Model",
    description: "Default model for OrcaRouter chats (e.g., orcarouter@orcarouter/auto)",
    type: "text",
    placeholder: DEFAULT_ORCAROUTER_CONFIG.model,
    group: "OrcaRouter",
  },
  {
    id: "orcarouterDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for OrcaRouter chats (0.0 to 2.0)",
    type: "text",
    placeholder: "0.7",
    group: "OrcaRouter",
  },
  {
    id: "orcarouterDefaultMaxTokens",
    valueType: "number",
    name: "Default Max Tokens",
    description: "Default max tokens for OrcaRouter chats",
    type: "text",
    placeholder: "400",
    group: "OrcaRouter",
  },

  // Ollama Defaults (Local)
  {
    id: "ollamaUrl",
    name: "API URL",
    description: `URL for Ollama API\nDefault URL: ${DEFAULT_OLLAMA_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_OLLAMA_CONFIG.url,
    group: "Ollama (Local)",
  },
  {
    id: "ollamaDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for Ollama chats (0.0 to 2.0)",
    type: "text",
    placeholder: "0.7",
    group: "Ollama (Local)",
  },
  ...numericProviderSettings("Ollama (Local)", [["ollamaDefaultTopP", "Top P", "1"]]),

  // LM Studio Defaults (Local)
  {
    id: "lmstudioUrl",
    name: "API URL",
    description: `URL for LM Studio API\nDefault URL: ${DEFAULT_LMSTUDIO_CONFIG.url}`,
    type: "text",
    placeholder: DEFAULT_LMSTUDIO_CONFIG.url,
    group: "LM Studio (Local)",
  },
  {
    id: "lmstudioDefaultTemperature",
    valueType: "number",
    name: "Default Temperature",
    description: "Default temperature for LM Studio chats (0.0 to 2.0)",
    type: "text",
    placeholder: "0.7",
    group: "LM Studio (Local)",
  },
  ...numericProviderSettings("LM Studio (Local)", [
    ["lmstudioDefaultTopP", "Top P", "1"],
    ["lmstudioDefaultPresencePenalty", "Presence Penalty", "0"],
    ["lmstudioDefaultFrequencyPenalty", "Frequency Penalty", "0"],
  ]),

  // Folders
  {
    id: "chatFolder",
    name: "Chat Folder",
    description: "Path to folder for chat files",
    type: "text",
    group: "Folders",
  },
  {
    id: "chatTemplateFolder",
    name: "Chat Template Folder",
    description: "Path to folder for chat file templates",
    type: "text",
    placeholder: "chat-templates",
    group: "Folders",
  },
  {
    id: "agentFolder",
    name: "Agent Folder",
    description: "Path to folder for agent files",
    type: "text",
    placeholder: "ChatGPT_MD/agents",
    group: "Folders",
  },

  // Formatting
  {
    id: "dateFormat",
    name: "Date Format",
    description: "Date format for chat files. Valid date blocks are: YYYY, MM, DD, hh, mm, ss",
    type: "text",
    placeholder: DEFAULT_DATE_FORMAT,
    group: "Formatting",
  },
  {
    id: "headingLevel",
    valueType: "number",
    name: "Heading Level",
    description: `Heading level for messages (example for heading level 2: '## ${ROLE_IDENTIFIER}${ROLE_USER}'). Valid heading levels are 0, 1, 2, 3, 4, 5, 6`,
    type: "text",
    group: "Formatting",
  },

  // Tool Calling
  {
    id: "enableToolCalling",
    name: "Enable AI Tool Calling (Experimental, read only)",
    description:
      "Privacy Focus: All tool calls require your explicit approval before the LLM sees the data. " +
      "Allow the AI to use tools: Search files, Read file contents, Web Search (Privacy focused Brave Search API). ",
    type: "toggle",
    group: "Tool Calling",
  },
  {
    id: "toolEnabledModels",
    name: "Tool-Enabled Models",
    description:
      "Models allowed to use tools (vault search, file read, web search).\n\n" +
      "Format: One model pattern per line. Supports wildcards (*).\n" +
      "Examples: 'gpt-4o', 'claude-*', 'gemini-1.5*'\n\n" +
      "Only tested models are included by default.",
    type: "textarea",
    placeholder: "gpt-5.2\ngpt-5.2-chat-latest\no3\nclaude-opus-4-5",
    group: "Tool Calling",
  },

  // Web Search configuration
  {
    id: "webSearchApiKey",
    name: "Brave Search API Key",
    description: "API key for Brave Search.",
    type: "credential",
    secretIdSetting: "webSearchApiKeySecretId",
    placeholder: "your Brave Search API key",
    group: "Tool Calling",
  },
  {
    id: "webSearchProvider",
    name: "Alternative Search Provider",
    description: "Use a custom search API endpoint instead of Brave Search",
    type: "dropdown",
    options: {
      brave: "Brave Search (Default)",
      custom: "Custom API Endpoint",
    },
    group: "Tool Calling",
  },
  {
    id: "webSearchApiUrl",
    name: "Custom Search API URL",
    description: "URL for custom search API endpoint (only when using Custom provider)",
    type: "text",
    placeholder: "https://your-search-api.com/search",
    group: "Tool Calling",
  },
  {
    id: "maxWebSearchResults",
    valueType: "number",
    name: "Max Web Search Results",
    description: "Maximum number of search results to return (1-10)",
    type: "text",
    placeholder: "5",
    group: "Tool Calling",
  },
  {
    id: "debugMode",
    name: "Debug Mode",
    description: "Enable detailed logging for debugging tool operations. Messages will appear in the console.",
    type: "toggle",
    group: "Tool Calling",
  },
];

export function createSettingsSchema(settings: ChatGPT_MDSettings): SettingDefinition[] {
  return SETTINGS_SCHEMA.map((setting) =>
    setting.id === "defaultChatFrontmatter" ? { ...setting, placeholder: settings.defaultChatFrontmatter } : setting
  );
}
