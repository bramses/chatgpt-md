import { requestUrl } from "obsidian";
import { ChatMDFrontMatter } from "../models/ChatSettingsModel";

export class ApiService {
  async callOpenAIAPI(
    frontmatter: ChatMDFrontMatter,
    messages: { role: string; content: string }[],
    apiKey: string
  ): Promise<string> {
    try {
      const response = await requestUrl({
        url: frontmatter.url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: frontmatter.model,
          messages: messages,
          max_tokens: frontmatter.max_tokens,
          temperature: frontmatter.temperature,
          top_p: frontmatter.top_p,
          presence_penalty: frontmatter.presence_penalty,
          frequency_penalty: frontmatter.frequency_penalty,
          n: frontmatter.n,
          stop: frontmatter.stop,
        }),
        throw: false,
      });

      const responseJSON = JSON.parse(response.text);
      if (responseJSON.choices && responseJSON.choices.length > 0) {
        return responseJSON.choices[0].message.content;
      } else {
        throw new Error("No valid response from API");
      }
    } catch (error) {
      console.error("Error calling OpenAI API: ", error);
      throw new Error("Failed to communicate with OpenAI API");
    }
  }
}
