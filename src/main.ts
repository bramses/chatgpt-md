import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";

import { StreamManager } from "src/stream";
import { ChatGPT_MDSettingsTab } from "src/Views/ChatGPT_MDSettingsTab";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { OpenAIService } from "src/Services/OpenAIService";
import { EditorService } from "src/Services/EditorService";
import {
  ADD_COMMENT_BLOCK_COMMAND_ID,
  ADD_HR_COMMAND_ID,
  CALL_CHATGPT_API_COMMAND_ID,
  CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
  CLEAR_CHAT_COMMAND_ID,
  COMMENT_BLOCK_END,
  COMMENT_BLOCK_START,
  INFER_TITLE_COMMAND_ID,
  MOVE_TO_CHAT_COMMAND_ID,
  ROLE_USER,
  STOP_STREAMING_COMMAND_ID,
} from "src/Constants";

export default class ChatGPT_MD extends Plugin {
  settings: ChatGPT_MDSettings;
  openAIService: OpenAIService;
  editorService: EditorService;
  statusBarItemEl: HTMLElement;

  async onload() {
    this.statusBarItemEl = this.addStatusBarItem();

    await this.loadSettings();

    const streamManager = new StreamManager();
    this.openAIService = new OpenAIService(streamManager);
    this.editorService = new EditorService(this.app);

    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: CALL_CHATGPT_API_COMMAND_ID,
      name: "Chat",
      icon: "message-circle",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        // get frontmatter
        const frontmatter = this.editorService.getFrontmatter(view, this.settings, this.app);

        try {
          this.updateStatusBar(`[ChatGPT MD] Calling ${frontmatter.model}`);

          // get messages from editor
          const { messagesWithRole: messagesWithRoleAndMessage, messages } = this.editorService.getMessagesFromEditor(
            editor,
            this.settings
          );

          // move cursor to end of file if generateAtCursor is false
          if (!this.settings.generateAtCursor) {
            this.editorService.moveCursorToEnd(editor);
          }

          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
          }

          const response = await this.openAIService.callOpenAIAPI(
            this.settings.apiKey,
            messagesWithRoleAndMessage,
            frontmatter,
            frontmatter.stream,
            this.editorService.getHeadingPrefix(this.settings.headingLevel),
            editor,
            this.settings.generateAtCursor
          );

          await this.editorService.processResponse(editor, response, this.settings);

          if (this.settings.autoInferTitle) {
            await this.editorService.inferTitle(editor, view, this.settings, this.settings.apiKey, messages);
          }
          this.updateStatusBar("");
        } catch (err) {
          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}. ` + err, 9000);
          }
          this.updateStatusBar("");
          console.log(err);
        }
      },
    });

    this.addCommand({
      id: ADD_HR_COMMAND_ID,
      name: "Add divider",
      icon: "minus",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.editorService.addHorizontalRule(editor, ROLE_USER, this.settings.headingLevel);
      },
    });

    this.addCommand({
      id: ADD_COMMENT_BLOCK_COMMAND_ID,
      name: "Add comment block",
      icon: "comment",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        // add a comment block at cursor in format: =begin-chatgpt-md-comment and =end-chatgpt-md-comment
        const cursor = editor.getCursor();
        const line = cursor.line;
        const ch = cursor.ch;

        const commentBlock = `${COMMENT_BLOCK_START}\n\n${COMMENT_BLOCK_END}`;
        editor.replaceRange(commentBlock, cursor);

        // move cursor to middle of comment block
        const newCursor = {
          line: line + 1,
          ch: ch,
        };
        editor.setCursor(newCursor);
      },
    });

    this.addCommand({
      id: STOP_STREAMING_COMMAND_ID,
      name: "Stop streaming",
      icon: "octagon",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        streamManager.stopStreaming();
      },
    });

    this.addCommand({
      id: INFER_TITLE_COMMAND_ID,
      name: "Infer title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        // get frontmatter
        const frontmatter = this.editorService.getFrontmatter(view, this.settings, this.app);
        this.updateStatusBar(`[ChatGPT MD] Calling ${frontmatter.model}`);
        const { messages } = this.editorService.getMessagesFromEditor(editor, this.settings);

        await this.editorService.inferTitle(editor, view, this.settings, this.settings.apiKey, messages);
        this.updateStatusBar("");
      },
    });

    // grab highlighted text and move to new file in default chat format
    this.addCommand({
      id: MOVE_TO_CHAT_COMMAND_ID,
      name: "Create new chat with highlighted text",
      icon: "highlighter",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        try {
          await this.editorService.createNewChatWithHighlightedText(editor, this.settings);
        } catch (err) {
          console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
          new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
        }
      },
    });

    this.addCommand({
      id: CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
      name: "Create new chat from template",
      icon: "layout-template",
      callback: async () => {
        await this.editorService.createNewChatFromTemplate(
          this.settings,
          this.editorService.getDate(new Date(), this.settings.dateFormat)
        );
      },
    });

    this.addCommand({
      id: CLEAR_CHAT_COMMAND_ID,
      name: "Clear chat (except frontmatter)",
      icon: "trash",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        this.editorService.clearChat(editor);
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ChatGPT_MDSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
