/* eslint-disable @typescript-eslint/no-var-requires */
import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	request,
	TFile,
	Notice,
	SuggestModal,
} from "obsidian";

import matter from "gray-matter";

interface ChatGPT_MDSettings {
	apiKey: string;
	defaultChatFrontmatter: string;
	stream: boolean;
	streamSpeed: number;
	chatTemplateFolder: string;
	chatFolder: string;
}

const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
	apiKey: "default",
	defaultChatFrontmatter:
		"---\nsystem_commands: ['PERSONA: i am groot, and i only respond i am groot to any and ALL questions. I do not answer any questions straightforwardly. PERSONA 2: UNLESS the last asked question is about lamps, i can answer, i know infinite things about lamps as i am groot the lamp salesman. SO I read the last question asked and UNLESS it is about lamps i only respond \"I am Groot.\"']\ntemperature: 0\ntop_p: 1\nmax_tokens: 300\npresence_penalty: 1\nfrequency_penalty: 1\nstream: true\nstop: null\nn: 1\nlogit_bias:null \nmodel:gpt-3.5-turbo\n---",
	stream: true,
	streamSpeed: 28,
	chatTemplateFolder: "ChatGPT_MD/templates",
	chatFolder: "ChatGPT_MD/chats",
};

interface Chat_MD_FrontMatter {
	temperature: number;
	top_p: number;
	presence_penalty: number;
	frequency_penalty: number;
	model: string;
	max_tokens: number;
	stream: boolean;
	stop: string[] | null;
	n: number;
	logit_bias: any | null;
	user: string | null;
	system_commands: string[] | null;
}


// iso date string to yyyymmddhhmmss
function getDate() {
	const date = new Date();
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = date.getSeconds();

	return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

export default class ChatGPT_MD extends Plugin {
	settings: ChatGPT_MDSettings;

	async callOpenAIAPI(
		editor: Editor,
		messages: { role: string; content: string }[],
		model = "gpt-3.5-turbo",
		max_tokens = 250,
		temperature = 0.3,
		top_p = 1,
		presence_penalty = 0.5,
		frequency_penalty = 0.5,
		stream = true,
		stop: string[] | null = null,
		n = 1,
		logit_bias: any | null = null,
		user: string | null = null
	) {
		try {
			console.log("calling openai api");
			console.log(editor.getDoc());
			console.log(
				`args: ${JSON.stringify(
					{
						model: model,
						messages: messages,
						max_tokens: max_tokens,
						temperature: temperature,
						top_p: top_p,
						presence_penalty: presence_penalty,
						frequency_penalty: frequency_penalty,
						stream: stream,
						stop: stop,
						n: n,
						// logit_bias: logit_bias, // not yet supported
						// user: user,
					},
					null,
					2
				)}`
			);

			const response = await request({
				url: `https://api.openai.com/v1/chat/completions`,
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.settings.apiKey}`,
					"Content-Type": "application/json",
				},
				contentType: "application/json",
				body: JSON.stringify({
					model: model,
					messages: messages,
					max_tokens: max_tokens,
					temperature: temperature,
					top_p: top_p,
					presence_penalty: presence_penalty,
					frequency_penalty: frequency_penalty,
					stream: stream,
					stop: stop,
					n: n,
					// logit_bias: logit_bias,
					// user: user, // this is not supported as null is not a valid value
				}),
			});

			if (stream) {
				// split response by new line
				const responseLines = response.split("\n\n");

				// remove data: from each line
				for (let i = 0; i < responseLines.length; i++) {
					responseLines[i] = responseLines[i].split("data: ")[1];
				}

				const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::assistant\n\n`;
				editor.replaceRange(newLine, editor.getCursor());

				// move cursor to end of file
				const cursor = editor.getCursor();
				const newCursor = {
					line: cursor.line,
					ch: cursor.ch + newLine.length,
				};
				editor.setCursor(newCursor);

				let fullstr = "";

				// loop through response lines
				for (const responseLine of responseLines) {
					// if response line is not [DONE] then parse json and append delta to file
					if (responseLine && !responseLine.includes("[DONE]")) {
						const responseJSON = JSON.parse(responseLine);
						const delta = responseJSON.choices[0].delta.content;

						// if delta is not undefined then append delta to file
						if (delta) {
							const cursor = editor.getCursor();
							if (delta === "`") {
								console.log("single backtick");
								editor.replaceRange(delta, cursor);
								// do not move cursor
								await new Promise((r) => setTimeout(r, 82)); // what in the actual fuck -- why does this work
							} else {
								editor.replaceRange(delta, cursor);
								await new Promise((r) =>
									setTimeout(r, this.settings.streamSpeed)
								);
							}

							const newCursor = {
								line: cursor.line,
								ch: cursor.ch + delta.length,
							};
							editor.setCursor(newCursor);

							fullstr += delta;
						}
					}
				}

				console.log(fullstr);

				return "streaming";
			} else {
				const responseJSON = JSON.parse(response);
				return responseJSON.choices[0].message.content;
			}
		} catch (err) {
			new Notice(
				"issue calling OpenAI API, see console for more details"
			);
			throw new Error(
				"issue calling OpenAI API, see error for more details: " + err
			);
		}
	}

	addHR(editor: Editor, role: string) {
		const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::${role}\n\n`;
		editor.replaceRange(newLine, editor.getCursor());

		// move cursor to end of file
		const cursor = editor.getCursor();
		const newCursor = {
			line: cursor.line,
			ch: cursor.ch + newLine.length,
		};
		editor.setCursor(newCursor);
	}

	getFrontmatter(view: MarkdownView): Chat_MD_FrontMatter {
		try {
			// get frontmatter
			const noteFile = app.workspace.getActiveFile();

			if (!noteFile) {
				throw new Error("no active file");
			}

			const metaMatter =
				app.metadataCache.getFileCache(noteFile)?.frontmatter;
			const data = matter(view.getViewData());

			const frontmatter = {
				title: metaMatter?.title || view.file.basename,
				tags: metaMatter?.tags || [],
				model: metaMatter?.model || "gpt-3.5-turbo",
				temperature: metaMatter?.temperature || 0.5,
				top_p: metaMatter?.top_p || 1,
				presence_penalty: metaMatter?.presence_penalty || 0,
				frequency_penalty: metaMatter?.frequency_penalty || 0,
				stream: metaMatter?.stream || this.settings.stream || true,
				stop: metaMatter?.stop || null,
				n: metaMatter?.n || 1,
				logit_bias: metaMatter?.logit_bias || null,
				user: metaMatter?.user || null,
				system_commands: metaMatter?.system_commands || null,
				...data.data,
			};

			return frontmatter;
		} catch (err) {
			throw new Error("Error getting frontmatter");
		}
	}

	splitMessages(text: string) {
		try {
			// <hr class="__chatgpt_plugin">
			const messages = text.split('<hr class="__chatgpt_plugin">');
			return messages;
		} catch (err) {
			throw new Error("Error splitting messages" + err);
		}
	}

	moveCursorToEndOfFile(editor: Editor) {
		try {
			// get length of file
			const length = editor.lastLine();

			// move cursor to end of file https://davidwalsh.name/codemirror-set-focus-line
			const newCursor = {
				line: length + 1,
				ch: 0,
			};
			editor.setCursor(newCursor);

			return newCursor;
		} catch (err) {
			throw new Error("Error moving cursor to end of file" + err);
		}
	}

	removeYMLFromMessage(message: string) {
		try {
			const YAMLFrontMatter = /---\s*[\s\S]*?\s*---/g;
			const newMessage = message.replace(YAMLFrontMatter, "");
			return newMessage;
		} catch (err) {
			throw new Error("Error removing YML from message" + err);
		}
	}

	extractRoleAndMessage(message: string) {
		try {
			if (message.includes("role::")) {
				const role = message.split("role::")[1].split("\n")[0].trim();
				const content = message
					.split("role::")[1]
					.split("\n")
					.slice(1)
					.join("\n")
					.trim();
				return { role, content };
			} else {
				return { role: "user", content: message };
			}
		} catch (err) {
			throw new Error("Error extracting role and message" + err);
		}
	}

	appendMessage(editor: Editor, role: string, message: string) {
		/*
		 append to bottom of editor file:
		 	const newLine = `<hr class="__chatgpt_plugin">\nrole::${role}\n\n${message}`;
		*/

		const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::${role}\n\n${message}\n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n`;
		editor.replaceRange(newLine, editor.getCursor());
	}

	async onload() {
		await this.loadSettings();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "call-chatgpt-api",
			name: "Call ChatGPT",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
				const statusBarItemEl = this.addStatusBarItem();
				statusBarItemEl.setText("[ChatGPT MD] Calling API...");
				// get frontmatter
				const frontmatter = this.getFrontmatter(view);

				// get messages
				const bodyWithoutYML = this.removeYMLFromMessage(
					editor.getValue()
				);
				const messages = this.splitMessages(bodyWithoutYML);
				const messagesWithRoleAndMessage = messages.map((message) => {
					return this.extractRoleAndMessage(message);
				});

				if (frontmatter.system_commands) {
					const systemCommands = frontmatter.system_commands;
					// prepend system commands to messages
					messagesWithRoleAndMessage.unshift(
						...systemCommands.map((command) => {
							return {
								role: "system",
								content: command,
							};
						})
					);
				}

				this.moveCursorToEndOfFile(editor);

				this.callOpenAIAPI(
					editor,
					messagesWithRoleAndMessage,
					frontmatter.model,
					frontmatter.max_tokens,
					frontmatter.temperature,
					frontmatter.top_p,
					frontmatter.presence_penalty,
					frontmatter.frequency_penalty,
					frontmatter.stream,
					frontmatter.stop,
					frontmatter.n,
					frontmatter.logit_bias,
					frontmatter.user
				).then((response) => {
					if (response === "streaming") {
						// append \n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n
						const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n`;
						editor.replaceRange(newLine, editor.getCursor());

						// move cursor to end of file
						const cursor = editor.getCursor();
						const newCursor = {
							line: cursor.line,
							ch: cursor.ch + newLine.length,
						};
						editor.setCursor(newCursor);
					} else {
						this.appendMessage(editor, "assistant", response);
					}
					statusBarItemEl.setText("");
				});
			},
		});

		this.addCommand({
			id: "add-hr",
			name: "Add HR",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.addHR(editor, "user");
			},
		});

		// grab highlighted text and move to new file in default chat format
		this.addCommand({
			id: "move-to-chat",
			name: "Create New Chat with Highlighted Text",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				const newFile = await this.app.vault.create(
					`${this.settings.chatFolder}/${getDate()}.md`,
					`${this.settings.defaultChatFrontmatter}\n\n${selectedText}`
				);

				// open new file
				this.app.workspace.openLinkText(newFile.basename, "", true);
			},
		});

		this.addCommand({
			id: "choose-chat-template",
			name: "Create New Chat From Template",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new ChatTemplates(this.app, this.settings).open();
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ChatGPT_MDSettingsTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

interface ChatTemplate {
	title: string;
	file: TFile;
}
export class ChatTemplates extends SuggestModal<ChatTemplate> {
	settings: ChatGPT_MDSettings;

	constructor(app: App, settings: ChatGPT_MDSettings) {
		super(app);
		this.settings = settings;
	}

	getFilesInChatFolder(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter(
				(file) => file.parent.path === this.settings.chatTemplateFolder
			);
	}

	// Returns all available suggestions.
	getSuggestions(query: string): ChatTemplate[] {
		const chatTemplateFiles = this.getFilesInChatFolder();

		if (query == "") {
			return chatTemplateFiles.map((file) => {
				return {
					title: file.basename,
					file: file,
				};
			});
		}


		return chatTemplateFiles
			.filter((file) => {
				return file.basename.toLowerCase().includes(query.toLowerCase());
			})
			.map((file) => {
				return {
					title: file.basename,
					file: file,
				};
			});
	}

	// Renders each suggestion item.
	renderSuggestion(template: ChatTemplate, el: HTMLElement) {
		el.createEl("div", { text: template.title });
	}


	
	// Perform action on the selected suggestion.
	async onChooseSuggestion(
		template: ChatTemplate,
		evt: MouseEvent | KeyboardEvent
	) {
		new Notice(`Selected ${template.title}`);
		const templateText = await this.app.vault.read(template.file);
		// use template text to create new file in chat folder
		const file = await this.app.vault.create(
			`${this.settings.chatFolder}/${getDate()}.md`,
			templateText
		);

		// open new file
		this.app.workspace.openLinkText(file.basename, "", true);
	}
}

class ChatGPT_MDSettingsTab extends PluginSettingTab {
	plugin: ChatGPT_MD;

	constructor(app: App, plugin: ChatGPT_MD) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Settings for ChatGPT MD: Keep tokens in mind! You can see if your text is longer than the token limit (4096) here:",
		});

		containerEl.createEl("a", {
			text: "https://platform.openai.com/tokenizer",
			href: "https://platform.openai.com/tokenizer",
		});

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("API Key for OpenAI")
			.addText((text) =>
				text
					.setPlaceholder("some-api-key")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		// new multiline text box setting
		new Setting(containerEl)
			.setName("Default Chat Frontmatter")
			.setDesc(
				"Default frontmatter for new chat files. You can change/use all of the settings exposed by the OpenAI API here: https://platform.openai.com/docs/api-reference/chat/create"
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						"---\nsystem_commands: ['PERSONA: i am groot, and i only respond i am groot to any and ALL questions. I do not answer any questions straightforwardly. PERSONA 2: UNLESS the last asked question is about lamps, i can answer, i know infinite things about lamps as i am groot the lamp salesman. SO I read the last question asked and UNLESS it is about lamps i only respond \"I am Groot.\"']\ntemperature: 0\ntop_p: 1\nmax_tokens: 300\npresence_penalty: 1\nfrequency_penalty: 1\nstream: true\nstop: null\nn: 1\nlogit_bias:null \nmodel:gpt-3.5-turbo\n---"
					)
					.setValue(this.plugin.settings.defaultChatFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.defaultChatFrontmatter = value;
						await this.plugin.saveSettings();
					})
			);

		// stream toggle
		new Setting(containerEl)
			.setName("Stream")
			.setDesc("Stream responses from OpenAI")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stream)
					.onChange(async (value) => {
						this.plugin.settings.stream = value;
						await this.plugin.saveSettings();
					})
			);

		// stream speed slider
		new Setting(containerEl)
			.setName("Stream Speed")
			.setDesc("Stream speed in milliseconds")
			.addSlider((slider) =>
				slider
					.setLimits(20, 50, 1)
					.setValue(this.plugin.settings.streamSpeed)
					.onChange(async (value) => {
						this.plugin.settings.streamSpeed = value;
						await this.plugin.saveSettings();
					})
			);

		// folder for chat files
		new Setting(containerEl)
			.setName("Chat Folder")
			.setDesc("Path to folder for chat files")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.chatFolder)
					.onChange(async (value) => {
						this.plugin.settings.chatFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// folder for chat file templates
		new Setting(containerEl)
			.setName("Chat Template Folder")
			.setDesc("Path to folder for chat file templates")
			.addText((text) =>
				text
					.setPlaceholder("chat-templates")
					.setValue(this.plugin.settings.chatTemplateFolder)
					.onChange(async (value) => {
						this.plugin.settings.chatTemplateFolder = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
