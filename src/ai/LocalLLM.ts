import { AIModel } from "./AIModel";
import { ChatMDFrontMatter } from "../models/ChatSettingsModel";
import { Editor } from "codemirror";

export class LocalLLM implements AIModel {
  id: string = "local";
  name: string = "Local LLM";

  async callAPI(
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[],
    apiKey: string
  ): Promise<string> {
    // Implement Local LLM API call here
    console.log("Calling Local LLM API");
    // Placeholder response
    return "Local LLM response (placeholder)";
  }

  async stream(
    editor: Editor,
    apiKey: string,
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[]
  ): Promise<void> {
    // Implement Local LLM streaming here
    console.log("Local LLM streaming not implemented");
    // Optionally, you can throw an error or provide a notice
  }

  stopStreaming(): void {
    // Implement method to stop Local LLM streaming if applicable
    console.log("Local LLM streaming stop method called");
  }

  async inferTitle(
    messages: { role: string; content: string }[],
    language: string
  ): Promise<string> {
    // Implement title inference using Local LLM
    console.log("Local LLM inferTitle not implemented");
    return "Local LLM inferred title (placeholder)";
  }
}
