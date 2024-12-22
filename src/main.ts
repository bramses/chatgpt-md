import { Plugin, MarkdownView, Editor } from "obsidian";
import { ChatController } from "./controllers/ChatController";
import { ApiService } from "./services/ApiService";
import { StreamService } from "./services/StreamService";
import { ChatView } from "./views/ChatView";
import { ChatMDSettings, DEFAULT_SETTINGS } from "./models/ChatSettingsModel";
import { SettingsView } from "./views/SettingsView";

export default class ChatGPT_MD extends Plugin {
  settings: ChatMDSettings;
  chatController: ChatController;

  async onload() {
    await this.loadSettings();

    const chatView = new ChatView(this.settings);
    const apiService = new ApiService();
    const streamService = new StreamService();
    this.chatController = new ChatController(
      apiService,
      streamService,
      chatView,
      this.settings
    );

    this.addCommand({
      id: "call-chatgpt-api",
      name: "Chat",
      icon: "message-circle",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (view instanceof MarkdownView) {
          this.chatController.handleChatCommand(editor, view);
        }
      },
    });

    this.addSettingTab(new SettingsView(this.app, this));
  }

  onunload() {
    console.log("Unloading ChatGPT_MD Plugin");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
