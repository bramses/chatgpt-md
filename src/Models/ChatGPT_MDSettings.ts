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
