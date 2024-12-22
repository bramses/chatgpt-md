import { Editor, MarkdownView } from "obsidian";
import { ChatMDSettings, ChatMDFrontMatter } from "../models/ChatSettingsModel";
import { DEFAULT_URL } from "../utils/constants";
import { moveCursorToEndOfFile } from "../utils/helpers";

export class ChatView {
  private settings: ChatMDSettings;

  constructor(settings: ChatMDSettings) {
    this.settings = settings;
  }

  extractFrontmatter(view: MarkdownView): ChatMDFrontMatter | null {
    try {
      const noteFile = view.file;
      if (!noteFile) {
        return null;
      }

      const metaMatter = app.metadataCache.getFileCache(noteFile)?.frontmatter;

      const shouldStream = metaMatter?.stream ?? this.settings.stream;
      const temperature = metaMatter?.temperature ?? 0.3;

      return {
        model: metaMatter?.model || "gpt-3.5-turbo",
        temperature: temperature,
        top_p: metaMatter?.top_p || 1,
        presence_penalty: metaMatter?.presence_penalty || 0,
        frequency_penalty: metaMatter?.frequency_penalty || 0,
        stream: shouldStream,
        max_tokens: metaMatter?.max_tokens || 512,
        stop: metaMatter?.stop || null,
        n: metaMatter?.n || 1,
        logit_bias: metaMatter?.logit_bias || null,
        user: metaMatter?.user || null,
        system_commands: metaMatter?.system_commands || null,
        url: metaMatter?.url || DEFAULT_URL,
      };
    } catch (err) {
      console.error("Error extracting frontmatter: ", err);
      return null;
    }
  }

  extractMessages(editor: Editor): { role: string; content: string }[] {
    const bodyWithoutYML = this.removeYMLFromMessage(editor.getValue());
    const messages = this.splitMessages(bodyWithoutYML);

    return messages.map(this.extractRoleAndMessage);
  }

  appendResponse(editor: Editor, role: string, message: string) {
    const newLine = `\n\n<hr class="__chatgpt_plugin">\n\n${this.getHeadingPrefix()}role::${role}\n\n${message}\n\n`;
    editor.replaceRange(newLine, editor.getCursor());
  }

  moveToEndOfFile(editor: Editor) {
    moveCursorToEndOfFile(editor);
  }

  private splitMessages(text: string): string[] {
    try {
      return text.split('<hr class="__chatgpt_plugin">');
    } catch (err) {
      console.error("Error splitting messages: ", err);
      return [];
    }
  }

  private removeYMLFromMessage(message: string): string {
    try {
      const YAMLFrontMatter = /---\s*[\s\S]*?\s*---/g;
      return message.replace(YAMLFrontMatter, "");
    } catch (err) {
      console.error("Error removing YML from message: ", err);
      return message;
    }
  }

  private extractRoleAndMessage(message: string): {
    role: string;
    content: string;
  } {
    try {
      if (message.includes("role::")) {
        const parts = message.split("role::");
        const role = parts[1].split("\n")[0].trim();
        const content = parts[1].split("\n").slice(1).join("\n").trim();
        return { role, content };
      }
      return { role: "user", content: message };
    } catch (err) {
      console.error("Error extracting role and message: ", err);
      return { role: "user", content: message };
    }
  }

  public getHeadingPrefix(): string {
    const headingLevel = this.settings.headingLevel;
    if (headingLevel < 1) {
      return "";
    }
    return "#".repeat(Math.min(headingLevel, 6)) + " ";
  }
  public getDate(date: Date, format = "YYYYMMDDhhmmss") {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();

    const paddedMonth = month.toString().padStart(2, "0");
    const paddedDay = day.toString().padStart(2, "0");
    const paddedHour = hour.toString().padStart(2, "0");
    const paddedMinute = minute.toString().padStart(2, "0");
    const paddedSecond = second.toString().padStart(2, "0");

    return format
      .replace("YYYY", year.toString())
      .replace("MM", paddedMonth)
      .replace("DD", paddedDay)
      .replace("hh", paddedHour)
      .replace("mm", paddedMinute)
      .replace("ss", paddedSecond);
  }
}
