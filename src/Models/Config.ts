import { DEFAULT_CHAT_FRONT_MATTER } from "src/Models/OpenAIConfig";

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

export const HORIZONTAL_LINE = '<hr class="__chatgpt_plugin">';
