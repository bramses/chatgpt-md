export interface ChatMDSettings {
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
  model: string;
}

export const DEFAULT_SETTINGS: ChatMDSettings = {
  apiKey: "default",
  defaultChatFrontmatter: `---
system_commands: ['I am a helpful assistant.']
temperature: 0
top_p: 1
max_tokens: 512
presence_penalty: 1
frequency_penalty: 1
stream: true
stop: null
n: 1
model: gpt-3.5-turbo
---`,
  stream: true,
  chatTemplateFolder: "ChatGPT_MD/templates",
  chatFolder: "ChatGPT_MD/chats",
  generateAtCursor: false,
  autoInferTitle: false,
  dateFormat: "YYYYMMDDhhmmss",
  headingLevel: 0,
  inferTitleLanguage: "English",
  model: "openai", // Default model
};

export interface ChatMDFrontMatter {
  temperature: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  model: string;
  max_tokens: number;
  stream: boolean;
  stop: string[] | null;
  n: number;
  logit_bias: any | null;
  user: string | null;
  system_commands: string[] | null;
  url: string;
}
