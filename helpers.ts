import { FileManager, MarkdownView, Notice, Vault } from "obsidian";

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
        console.log("[ChatGPT MD] Error writing inferred title to editor", err)
		throw err;
	}
};
