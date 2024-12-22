import { ChatView } from "../views/ChatView";
import { ChatMDSettings, ChatMDFrontMatter } from "../models/ChatSettingsModel";
import {
  Editor,
  MarkdownView,
  Notice,
  Vault,
  App,
  FileManager,
  TFile,
  TFolder,
} from "obsidian";
import { AIModel } from "../ai/AIModel";
import { OpenAIModel } from "../ai/OpenAIModel";
import { LocalLLM } from "../ai/LocalLLM";
import {
  createFolderModal,
  writeInferredTitleToEditor,
} from "../utils/helpers";
import { TemplateSelectionDialog } from "../utils/TemplateSelectionDialog";

export class ChatController {
  private view: ChatView;
  private settings: ChatMDSettings;
  private aiModel: AIModel | null = null;
  private app: App;
  private fileManager: FileManager;

  constructor(
    view: ChatView,
    settings: ChatMDSettings,
    app: App,
    fileManager: FileManager
  ) {
    this.view = view;
    this.settings = settings;
    this.app = app;
    this.fileManager = fileManager;
    this.aiModel = this.createAIModel(this.settings.model);
  }
  createAIModel(modelId: string): AIModel {
    switch (modelId) {
      case "openai":
        return new OpenAIModel(this.settings, this.settings.apiKey);
      case "local":
        return new LocalLLM();
      default:
        return new OpenAIModel(this.settings, this.settings.apiKey);
    }
  }
  updateSettings(settings: ChatMDSettings): void {
    this.settings = settings;
    this.aiModel = this.createAIModel(this.settings.model);
  }

  async handleChatCommand(editor: Editor, view: MarkdownView): Promise<void> {
    if (!this.aiModel) {
      new Notice("AI Model not initialized.");
      return;
    }
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
        await this.aiModel.stream(
          editor,
          this.settings.apiKey,
          frontmatter,
          messages
        );
      } else {
        const response = await this.aiModel.callAPI(
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

  // 2. Add Divider
  addDivider(editor: Editor): void {
    const divider = `\n\n---\n\n`;
    editor.replaceRange(divider, editor.getCursor());
  }

  // 3. Add Comment Block
  addCommentBlock(editor: Editor): void {
    const cursor = editor.getCursor();
    const line = cursor.line;
    const ch = cursor.ch;

    const commentBlock = `=begin-chatgpt-md-comment\n\n=end-chatgpt-md-comment`;
    editor.replaceRange(commentBlock, cursor);

    // Move cursor to the middle of the comment block
    const newCursor = { line: line + 1, ch: 0 };
    editor.setCursor(newCursor);
  }

  // 4. Stop Streaming
  stopStreaming(): void {
    if (this.aiModel) {
      this.aiModel.stopStreaming();
      new Notice("Streaming has been stopped.");
    } else {
      new Notice("No active streaming to stop.");
    }
  }

  // 5. Infer Title
  async inferTitle(editor: Editor, view: MarkdownView): Promise<void> {
    try {
      const messages = this.view.extractMessages(editor);
      if (messages.length < 2) {
        new Notice(
          "Not enough messages to infer title. Minimum 2 messages required."
        );
        return;
      }

      new Notice("[ChatGPT MD] Inferring title from messages...");

      const title = await this.aiModel?.inferTitle(
        messages,
        this.settings.inferTitleLanguage
      );
      if (title) {
        await writeInferredTitleToEditor(
          this.app.vault,
          view,
          this.fileManager,
          this.settings.chatFolder,
          title
        );
        new Notice(`Inferred title: ${title}`);
      } else {
        new Notice("Could not infer title.");
      }
    } catch (error) {
      console.error("Error inferring title: ", error);
      new Notice("Failed to infer title.");
    }
  }

  // 6. Create New Chat with Highlighted Text
  async moveToChat(editor: Editor, view: MarkdownView): Promise<void> {
    try {
      const selectedText = editor.getSelection();
      if (!selectedText.trim()) {
        new Notice("No text selected.");
        return;
      }

      if (!this.settings.chatFolder || this.settings.chatFolder.trim() === "") {
        new Notice("Chat folder is not set. Please configure it in settings.");
        return;
      }
      const chatFolderPath = this.settings.chatFolder;
      const chatFolder = this.app.vault.getAbstractFileByPath(chatFolderPath);
      if (!chatFolder) {
        const created = await createFolderModal(
          this.app,
          this.app.vault,
          "chatFolder",
          chatFolderPath
        );
        if (!created) {
          new Notice("Chat folder does not exist and was not created.");
          return;
        }
      }

      const titleDate = this.view.getDate(new Date(), this.settings.dateFormat);
      const newFileName = `${this.settings.chatFolder}/${titleDate}.md`;
      const fileContent = `${this.settings.defaultChatFrontmatter}\n\n${selectedText}`;

      // Create new file
      const newFile = await this.app.vault.create(newFileName, fileContent);

      // Open new file
      await this.app.workspace.openLinkText(newFile.basename, "", true);

      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        activeView.editor.focus();
        this.view.moveToEndOfFile(activeView.editor);
      }
    } catch (error) {
      console.error("Error moving to chat: ", error);
      new Notice("An error occurred while creating the new chat.");
    }
  }

  // 7. Create New Chat from Template
  async chooseChatTemplate(editor: Editor, view: MarkdownView): Promise<void> {
    try {
      if (
        !this.settings.chatTemplateFolder ||
        this.settings.chatTemplateFolder.trim() === ""
      ) {
        new Notice(
          "Chat Template folder is not set. Please configure it in settings."
        );
        return;
      }
      const templateFolderPath = this.settings.chatTemplateFolder;
      const templateFolder = this.app.vault.getAbstractFileByPath(
        templateFolderPath
      ) as TFolder;

      if (!templateFolder) {
        const created = await createFolderModal(
          this.app,
          this.app.vault,
          "chatTemplateFolder",
          templateFolderPath
        );
        if (!created) {
          new Notice(
            "Chat Template folder does not exist and was not created."
          );
          return;
        }
      }

      // Fetch templates
      const templates = templateFolder.children.filter(
        (file) => file instanceof TFile
      ) as TFile[];
      if (templates.length === 0) {
        new Notice("No templates found in the Chat Template folder.");
        return;
      }

      // Show a simple selection UI
      const templateTitles = templates.map((file) => file.basename);
      const selectedTemplate = await this.showTemplateSelection(templateTitles);

      if (!selectedTemplate) {
        new Notice("No template selected.");
        return;
      }

      const selectedFile = templates.find(
        (file) => file.basename === selectedTemplate
      );
      if (!selectedFile) {
        new Notice("Selected template not found.");
        return;
      }

      const templateContent = await this.app.vault.read(selectedFile);
      const titleDate = this.view.getDate(new Date(), this.settings.dateFormat);
      const newFileName = `${this.settings.chatFolder}/${titleDate}.md`;

      // Create new file with template content
      const newFile = await this.app.vault.create(newFileName, templateContent);

      // Open new file
      await this.app.workspace.openLinkText(newFile.basename, "", true);

      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        activeView.editor.focus();
        this.view.moveToEndOfFile(activeView.editor);
      }
    } catch (error) {
      console.error("Error choosing chat template: ", error);
      new Notice("An error occurred while creating the chat from template.");
    }
  }

  // Helper function to show a simple selection dialog
  async showTemplateSelection(templates: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      const dialog = new TemplateSelectionDialog(
        this.app,
        templates,
        (selected) => {
          resolve(selected);
        }
      );
      dialog.open();
    });
  }

  // 8. Clear Chat (Except Frontmatter)
  clearChat(editor: Editor): void {
    try {
      const frontmatterMatch = editor.getValue().match(/---\s*[\s\S]*?\s*---/);
      if (!frontmatterMatch) {
        new Notice("No frontmatter found.");
        return;
      }

      const frontmatter = frontmatterMatch[0];
      editor.setValue(frontmatter);

      // Move cursor to end of frontmatter
      const cursorPos = {
        line: editor.lastLine(),
        ch: 0,
      };
      editor.setCursor(cursorPos);
    } catch (error) {
      console.error("Error clearing chat: ", error);
      new Notice("An error occurred while clearing the chat.");
    }
  }
}
