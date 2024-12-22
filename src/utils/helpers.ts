import {
  FileManager,
  MarkdownView,
  Notice,
  Vault,
  App,
  Setting,
  Editor,
  Modal,
} from "obsidian";
import { TemplateSelectionDialog } from "./TemplateSelectionDialog";

export const unfinishedCodeBlock = (txt: string): boolean => {
  const matcher = txt.match(/```/g);
  return matcher !== null && matcher.length % 2 !== 0;
};

export const writeInferredTitleToEditor = async (
  vault: Vault,
  view: MarkdownView,
  fileManager: FileManager,
  chatFolder: string,
  title: string
) => {
  try {
    const file = view.file;
    if (!file) {
      throw new Error("No file is currently open");
    }

    const folder = chatFolder.replace(/\/$/, "");

    let newFileName = `${folder}/${title}.md`;
    let i = 1;

    while (await vault.adapter.exists(newFileName)) {
      newFileName = `${folder}/${title} (${i}).md`;
      i++;
    }

    await fileManager.renameFile(file, newFileName);
  } catch (err) {
    new Notice("[ChatGPT MD] Error writing inferred title to editor");
    console.error("[ChatGPT MD] Error writing inferred title to editor", err);
    throw err;
  }
};

export const createFolderModal = async (
  app: App,
  vault: Vault,
  folderName: string,
  folderPath: string
): Promise<boolean> => {
  const folderCreationModal = new FolderCreationModal(
    app,
    folderName,
    folderPath
  );
  folderCreationModal.open();
  const result = await folderCreationModal.waitForModalValue();

  if (result) {
    console.log("[ChatGPT MD] Creating folder");
    await vault.createFolder(folderPath);
  } else {
    console.log("[ChatGPT MD] Not creating folder");
  }

  return result;
};

class FolderCreationModal extends Modal {
  result: boolean;
  folderName: string;
  folderPath: string;
  modalPromise: Promise<boolean>;
  resolveModalPromise: (value: boolean) => void;

  constructor(app: App, folderName: string, folderPath: string) {
    super(app);
    this.folderName = folderName;
    this.folderPath = folderPath;

    this.result = false;
    this.modalPromise = new Promise((resolve) => {
      this.resolveModalPromise = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h2", {
      text: `[ChatGPT MD] No ${this.folderName} folder found.`,
    });

    contentEl.createEl("p", {
      text: `If you choose "Yes, Create", the plugin will automatically create a folder at: ${this.folderPath}. You can change this path in the plugin settings.`,
    });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Yes, Create Folder")
        .setTooltip("Create folder")
        .setCta()
        .onClick(() => {
          this.result = true;
          this.resolveModalPromise(this.result);
          this.close();
        })
    );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("No, I'll create it myself")
        .setTooltip("Cancel")
        .setCta()
        .onClick(() => {
          this.result = false;
          this.resolveModalPromise(this.result);
          this.close();
        })
    );
  }

  waitForModalValue(): Promise<boolean> {
    return this.modalPromise;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export const moveCursorToEndOfFile = (
  editor: Editor
): { line: number; ch: number } => {
  try {
    const length = editor.lastLine();
    const newCursor = { line: length + 1, ch: 0 };
    editor.setCursor(newCursor);
    return newCursor;
  } catch (err) {
    throw new Error("Error moving cursor to end of file" + err);
  }
};
