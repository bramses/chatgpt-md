import { Plugin, MarkdownView, Editor, App, FileManager } from "obsidian";
import { ChatController } from "./controllers/ChatController";
import { ChatView } from "./views/ChatView";
import { ChatMDSettings, DEFAULT_SETTINGS } from "./models/ChatSettingsModel";
import { SettingsView } from "./views/SettingsView";

export default class ChatGPT_MD extends Plugin {
  settings: ChatMDSettings;
  chatController: ChatController;

  async onload() {
    await this.loadSettings();

    const chatView = new ChatView(this.settings);
    this.chatController = new ChatController(
      chatView,
      this.settings,
      this.app,
      this.app.fileManager
    );

    // Register Commands
    this.registerCommands();

    // Register Settings Tab
    this.addSettingTab(new SettingsView(this.app, this));

    this.registerEvent(
      this.app.vault.on("modify", async () => {
        await this.loadSettings();
        this.chatController.updateSettings(this.settings);
      })
    );
  }
  registerCommands() {
    // 1. Call ChatGPT API
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

    // 2. Add Divider
    this.addCommand({
      id: "add-hr",
      name: "Add Divider",
      icon: "minus",
      editorCallback: (editor: Editor) => {
        this.chatController.addDivider(editor);
      },
    });

    // 3. Add Comment Block
    this.addCommand({
      id: "add-comment-block",
      name: "Add Comment Block",
      icon: "comment",
      editorCallback: (editor: Editor) => {
        this.chatController.addCommentBlock(editor);
      },
    });

    // 4. Stop Streaming
    this.addCommand({
      id: "stop-streaming",
      name: "Stop Streaming",
      icon: "octagon",
      editorCallback: () => {
        this.chatController.stopStreaming();
      },
    });

    // 5. Infer Title
    this.addCommand({
      id: "infer-title",
      name: "Infer Title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (view instanceof MarkdownView) {
          await this.chatController.inferTitle(editor, view);
        }
      },
    });

    // 6. Create New Chat with Highlighted Text
    this.addCommand({
      id: "move-to-chat",
      name: "Create New Chat with Highlighted Text",
      icon: "highlighter",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (view instanceof MarkdownView) {
          await this.chatController.moveToChat(editor, view);
        }
      },
    });

    // 7. Create New Chat from Template
    this.addCommand({
      id: "choose-chat-template",
      name: "Create New Chat from Template",
      icon: "layout-template",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (view instanceof MarkdownView) {
          await this.chatController.chooseChatTemplate(editor, view);
        }
      },
    });

    // 8. Clear Chat (Except Frontmatter)
    this.addCommand({
      id: "clear-chat",
      name: "Clear Chat (Except Frontmatter)",
      icon: "trash",
      editorCallback: (editor: Editor) => {
        this.chatController.clearChat(editor);
      },
    });
  }

  onunload() {
    console.log("Unloading ChatGPT_MD Plugin");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.chatController) {
      this.chatController.updateSettings(this.settings);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
