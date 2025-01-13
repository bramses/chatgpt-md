import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAIService";

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

export interface ChatGPT_MDSettings {
  apiKey: string;
  defaultChatFrontmatter: string;
  stream: boolean;
  chatTemplateFolder: string;
  chatFolder: string;
  generateAtCursor: boolean;
  autoInferTitle: boolean;
  dateFormat: string;
  headingLevel: number;
  inferTitleLanguage: string;
  system_commands?: string[] | null;
}

export const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
  apiKey: "default",
  defaultChatFrontmatter: DEFAULT_CHAT_FRONT_MATTER,
  stream: true,
  chatTemplateFolder: "ChatGPT_MD/templates",
  chatFolder: "ChatGPT_MD/chats",
  generateAtCursor: false,
  autoInferTitle: false,
  dateFormat: "YYYYMMDDhhmmss",
  headingLevel: 0,
  inferTitleLanguage: "English",
};
