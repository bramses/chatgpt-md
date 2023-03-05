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
} from "obsidian";

import matter from "gray-matter";
const {encode } = require('gpt-3-encoder')

interface ChatGPT_MDSettings {
	apiKey: string;
	defaultChatFrontmatter: string;
}


const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
	apiKey: "default",
	defaultChatFrontmatter:
		"---\nsystem_commands: ['PERSONA: i am groot, and i only respond i am groot to any and ALL questions. I do not answer any questions straightforwardly. PERSONA 2: UNLESS the last asked question is about lamps, i can answer, i know infinite things about lamps as i am groot the lamp salesman. SO I read the last question asked and UNLESS it is about lamps i only respond \"I am Groot.\"']\ntemperature: 0\ntop_p: 1\nmax_tokens: 300\npresence_penalty: 1\nfrequency_penalty: 1\nstream: true\nstop: null\nn: 1\nlogit_bias:null \nmodel:gpt-3.5-turbo\n---",
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
						// logit_bias: logit_bias,
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
				/*
				write data to file as it comes in while data: [DONE] is not in response
				data: {"id":"chatcmpl-6qNwACYUNL4z7HdFNTprBGONTYCa0","object":"chat.completion.chunk","created":1677943090,"model":"gpt-3.5-turbo-0301","choices":[{"delta":{"content":" converts"},"index":0,"finish_reason":null}]}
				*/

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
								await new Promise((r) => setTimeout(r, 28));
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
			console.log(err);
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
				stream: metaMatter?.stream || true,
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

	checkTokenLimit(messages: {content: string, role: string}[], limit = 4096) {
		const encoded = encode(messages.map(message => message.content).join(""))
		const size = encoded.length
		console.log(size)
			// check if message is over 4096 characters
			if (size > limit) {
				throw new Error(
					`Message is over ${limit} token limit by ${size - limit} tokens.`
				);
			}
		
	}

	extractRoleAndMessage(message: string) {
		/*
		extract role from message
		role::assistant


		message content (can be multiple lines)
		*/

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

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "call-chatgpt-api",
			name: "Call ChatGPT API",
			editorCallback: (editor: Editor, view: MarkdownView) => {
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

				// check if message is over 4096 characters
				this.checkTokenLimit(messagesWithRoleAndMessage);

				// this.moveCursorToEndOfFile(editor);

				// this.callOpenAIAPI(
				// 	editor,
				// 	messagesWithRoleAndMessage,
				// 	frontmatter.model,
				// 	frontmatter.max_tokens,
				// 	frontmatter.temperature,
				// 	frontmatter.top_p,
				// 	frontmatter.presence_penalty,
				// 	frontmatter.frequency_penalty,
				// 	frontmatter.stream,
				// 	frontmatter.stop,
				// 	frontmatter.n,
				// 	frontmatter.logit_bias,
				// 	frontmatter.user
				// ).then((response) => {
				// 	if (response === "streaming") {
				// 		// append \n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n
				// 		const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n`;
				// 		editor.replaceRange(newLine, editor.getCursor());

				// 		// move cursor to end of file
				// 		const cursor = editor.getCursor();
				// 		const newCursor = {
				// 			line: cursor.line,
				// 			ch: cursor.ch + newLine.length,
				// 		};
				// 		editor.setCursor(newCursor);
				// 	} else {
				// 		this.appendMessage(editor, "assistant", response);
				// 	}
				// });
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
			name: "Move to Chat",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selectedText = editor.getSelection();
				const newFile = new TFile();
				newFile.path = "chat.md";

				this.app.workspace.getLeaf().setViewState({
					type: "markdown",
					active: true,
				});
				// const newEditor = this.app.workspace.activeLeaf.view.sourceMode.cmEditor;
				// newEditor.replaceRange(selectedText, newEditor.getCursor());
				// this.addHR(newEditor, "user");
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
				"Default frontmatter for new chat files. You can change/use all of the settings exposed by the OpenAI API here: https://platform.openai.com/docs/api-reference/chat/create")
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
	}
}
