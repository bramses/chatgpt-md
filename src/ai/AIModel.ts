import { ChatMDFrontMatter } from "../models/ChatSettingsModel";
import { Editor } from "obsidian";

export interface AIModel {
  id: string;
  name: string;
  callAPI(
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[],
    apiKey: string
  ): Promise<string>;
  stream(
    editor: any,
    apiKey: string,
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[]
  ): Promise<void>;
  stopStreaming(): void;
  inferTitle(
    messages: { role: string; content: string }[],
    language: string
  ): Promise<string>;
}
