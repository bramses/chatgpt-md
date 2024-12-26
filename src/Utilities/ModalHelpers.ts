import { App, Vault } from "obsidian";

import { FolderCreationModal } from "src/Views/FolderCreationModal";

export const createFolderModal = async (
  app: App,
  vault: Vault,
  folderName: string,
  folderPath: string
): Promise<boolean> => {
  const folderCreationModal = new FolderCreationModal(app, folderName, folderPath);

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
