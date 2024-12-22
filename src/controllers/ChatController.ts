import { ApiService } from "../services/ApiService";
import { StreamService } from "../services/StreamService";
import { ChatView } from "../views/ChatView";
import { ChatMDSettings, ChatMDFrontMatter } from "../models/ChatSettingsModel";
import { Editor, MarkdownView, Notice } from "obsidian";

export class ChatController {
  private apiService: ApiService;
  private streamService: StreamService;
  private view: ChatView;
  private settings: ChatMDSettings;

  constructor(
    apiService: ApiService,
    streamService: StreamService,
    view: ChatView,
    settings: ChatMDSettings
  ) {
    this.apiService = apiService;
    this.streamService = streamService;
    this.view = view;
    this.settings = settings;
  }

  async handleChatCommand(editor: Editor, view: MarkdownView): Promise<void> {
    try {
      const frontmatter = this.view.extractFrontmatter(view);
      if (!frontmatter) {
        new Notice("Invalid frontmatter found.");
        return;
      }

      const messages = this.view.extractMessages(editor);
      if (!this.settings.generateAtCursor) {
        this.view.moveToEndOfFile(editor);
      }

      if (frontmatter.stream) {
        await this.streamService.streamMessages(
          editor,
          this.settings.apiKey,
          frontmatter,
          messages
        );
      } else {
        const response = await this.apiService.callOpenAIAPI(
          frontmatter,
          messages,
          this.settings.apiKey
        );
        this.view.appendResponse(editor, "assistant", response);
      }
    } catch (error) {
      console.error("Error handling chat command: ", error);
      new Notice("An error occurred while processing the chat command.");
    }
  }
}
