import {
	FileManager,
	MarkdownView,
	Notice,
	Vault,
	Modal,
	App,
	Setting,
} from "obsidian";

// check for unclosed code block in MD (three backticks), string should contain three backticks in a row
export const unfinishedCodeBlock = (txt: string) => {
	const matcher = txt.match(/```/g);
	if (!matcher) {
		return false;
	}

	if (matcher.length % 2 !== 0)
		console.log("[ChatGPT MD] unclosed code block detected");

	return matcher.length % 2 !== 0;
};

export const writeInferredTitleToEditor = async (
	vault: Vault,
	view: MarkdownView,
	fileManager: FileManager,
	chatFolder: string,
	title: string
) => {
	try {
		// set title of file
		const file = view.file;
		// replace trailing / if it exists
		const folder = chatFolder.replace(/\/$/, "");

		// if new file name exists in directory, append a number to the end
		let newFileName = `${folder}/${title}.md`;
		let i = 1;

		while (await vault.adapter.exists(newFileName)) {
			newFileName = `${folder}/${title} (${i}).md`;
			i++;
		}

		fileManager.renameFile(file, newFileName);
	} catch (err) {
		new Notice("[ChatGPT MD] Error writing inferred title to editor");
		console.log("[ChatGPT MD] Error writing inferred title to editor", err);
		throw err;
	}
};

export const createFolderModal = async (
	app: App,
	vault: Vault,
	folderName: string,
	folderPath: string
) => {
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

	constructor(
		app: App,
		folderName: string,
		folderPath: string
	) {
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
					this.result = true; // This can be any value the user provides.
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
					this.result = false; // This can be any value the user provides.
					this.resolveModalPromise(this.result);
					this.close();
				})
		);

	}

	waitForModalValue() {
		return this.modalPromise;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
