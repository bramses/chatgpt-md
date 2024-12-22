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
}

export const DEFAULT_SETTINGS: ChatMDSettings = {
  apiKey: "default",
  defaultChatFrontmatter: "...",
  stream: true,
  chatTemplateFolder: "ChatGPT_MD/templates",
  chatFolder: "ChatGPT_MD/chats",
  generateAtCursor: false,
  autoInferTitle: false,
  dateFormat: "YYYYMMDDhhmmss",
  headingLevel: 0,
  inferTitleLanguage: "English",
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
