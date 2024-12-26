import { App, MarkdownView, Notice } from "obsidian";

import { createFolderModal } from "src/Utilities/ModalHelpers";

export const writeInferredTitleToEditor = async (
  app: App,
  view: MarkdownView,
  chatFolder: string,
  title: string
): Promise<void> => {
  try {
    // set title of file
    const file = view.file;
    if (!file) {
      throw new Error("No file is currently open");
    }

    // replace trailing / if it exists
    const folder = chatFolder.replace(/\/$/, "");

    // if new file name exists in directory, append a number to the end
    let newFileName = `${folder}/${title}.md`;
    let i = 1;

    while (await app.vault.adapter.exists(newFileName)) {
      newFileName = `${folder}/${title} (${i}).md`;
      i++;
    }

    await ensureFolderExists(app, chatFolder, "chatFolder");

    await app.fileManager.renameFile(file, newFileName);
  } catch (err) {
    new Notice("[ChatGPT MD] Error writing inferred title to editor");
    console.log("[ChatGPT MD] Error writing inferred title to editor", err);
    throw err;
  }
};

export const ensureFolderExists = async (app: App, folderPath: string, folderType: string): Promise<boolean> => {
  if (!(await app.vault.adapter.exists(folderPath))) {
    const result = await createFolderModal(app, app.vault, folderType, folderPath);
    if (!result) {
      new Notice(
        `[ChatGPT MD] No ${folderType} found. One must be created to use plugin. Set one in settings and make sure it exists.`
      );
      return false;
    }
  }
  return true;
};
