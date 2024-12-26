import { ChatGPT_MDSettings } from "src/Models/ChatGPT_MDSettings";

// Default settings for ChatGPT_MD
export const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
  apiKey: "default",
  defaultChatFrontmatter: "",
  stream: true,
  chatTemplateFolder: "ChatGPT_MD/templates",
  chatFolder: "ChatGPT_MD/chats",
  generateAtCursor: false,
  autoInferTitle: false,
  dateFormat: "YYYYMMDDhhmmss",
  headingLevel: 0,
  inferTitleLanguage: "English",
};
