import { FileManager, MarkdownView, Notice, Vault } from "obsidian";

export const writeInferredTitleToEditor = async (
  vault: Vault,
  view: MarkdownView,
  fileManager: FileManager,
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

    while (await vault.adapter.exists(newFileName)) {
      newFileName = `${folder}/${title} (${i}).md`;
      i++;
    }

    await fileManager.renameFile(file, newFileName);
  } catch (err) {
    new Notice("[ChatGPT MD] Error writing inferred title to editor");
    console.log("[ChatGPT MD] Error writing inferred title to editor", err);
    throw err;
  }
};
