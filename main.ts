/* eslint-disable @typescript-eslint/no-var-requires */
import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
	TFile,
	Notice,
	SuggestModal,
	TFolder,
	Platform,
} from "obsidian";

import { streamSSE } from "./stream";
import { unfinishedCodeBlock } from "helpers";

interface ChatGPT_MDSettings {
	apiKey: string;
	defaultChatFrontmatter: string;
	stream: boolean;
	chatTemplateFolder: string;
	chatFolder: string;
	generateAtCursor: boolean;
	autoInferTitle: boolean;
	dateFormat: string;
	headingLevel: number;
}

const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
	apiKey: "default",
	defaultChatFrontmatter:
		"---\nsystem_commands: ['I am a helpful assistant.']\ntemperature: 0\ntop_p: 1\nmax_tokens: 512\npresence_penalty: 1\nfrequency_penalty: 1\nstream: true\nstop: null\nn: 1\nmodel: gpt-3.5-turbo\n---",
	stream: true,
	chatTemplateFolder: "ChatGPT_MD/templates",
	chatFolder: "ChatGPT_MD/chats",
	generateAtCursor: false,
	autoInferTitle: false,
	dateFormat: "YYYYMMDDhhmmss",
	headingLevel: 0,
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

			if (stream) {
				const options = {
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
					// user: user, // not yet supported
				};

				const response = await streamSSE(
					editor,
					this.settings.apiKey,
					options,
					this.settings.generateAtCursor,
					this.getHeadingPrefix()
				);

				console.log("response from stream", response);

				return { fullstr: response, mode: "streaming" };
			} else {
				const responseUrl = await requestUrl({
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
						// logit_bias: logit_bias, // not yet supported
						// user: user, // not yet supported
					}),
					throw: false,
				});

				try {
					const json = responseUrl.json;

					if (json && json.error) {
						new Notice(
							`[ChatGPT MD] Error :: ${json.error.message}`
						);
						throw new Error(JSON.stringify(json.error));
					}
				} catch (err) {
					// continue we got a valid str back
					if (err instanceof SyntaxError) {
						// continue
					} else {
						throw new Error(err);
					}
				}

				const response = responseUrl.text;
				const responseJSON = JSON.parse(response);
				return responseJSON.choices[0].message.content;
			}
		} catch (err) {
			if (err instanceof Object) {
				if (err.error) {
					new Notice(`[ChatGPT MD] Error :: ${err.error.message}`);
					throw new Error(JSON.stringify(err.error));
				} else {
					new Notice(`[ChatGPT MD] Error :: ${JSON.stringify(err)}`);
					throw new Error(JSON.stringify(err));
				}
			}

			new Notice(
				"issue calling OpenAI API, see console for more details"
			);
			throw new Error(
				"issue calling OpenAI API, see error for more details: " + err
			);
		}
	}

	addHR(editor: Editor, role: string) {
		const newLine = `\n\n<hr class="__chatgpt_plugin">\n\n${this.getHeadingPrefix()}role::${role}\n\n`;
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

			const shouldStream =
				metaMatter?.stream !== undefined
					? metaMatter.stream // If defined in frontmatter, use its value.
					: this.settings.stream !== undefined
					? this.settings.stream // If not defined in frontmatter but exists globally, use its value.
					: true; // Otherwise fallback on true.

			const temperature =
				metaMatter?.temperature !== undefined
					? metaMatter.temperature
					: 0.3;

			const frontmatter = {
				title: metaMatter?.title || view.file.basename,
				tags: metaMatter?.tags || [],
				model: metaMatter?.model || "gpt-3.5-turbo",
				temperature: temperature,
				top_p: metaMatter?.top_p || 1,
				presence_penalty: metaMatter?.presence_penalty || 0,
				frequency_penalty: metaMatter?.frequency_penalty || 0,
				stream: shouldStream,
				max_tokens: metaMatter?.max_tokens || 512,
				stop: metaMatter?.stop || null,
				n: metaMatter?.n || 1,
				logit_bias: metaMatter?.logit_bias || null,
				user: metaMatter?.user || null,
				system_commands: metaMatter?.system_commands || null,
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

	getHeadingPrefix() {
		const headingLevel = this.settings.headingLevel;
		if (headingLevel === 0) {
			return "";
		} else if (headingLevel > 6) {
			return "#".repeat(6) + " ";
		}
		return "#".repeat(headingLevel) + " ";
	}

	appendMessage(editor: Editor, role: string, message: string) {
		/*
		 append to bottom of editor file:
		 	const newLine = `<hr class="__chatgpt_plugin">\n${this.getHeadingPrefix()}role::${role}\n\n${message}`;
		*/

		const newLine = `\n\n<hr class="__chatgpt_plugin">\n\n${this.getHeadingPrefix()}role::${role}\n\n${message}\n\n<hr class="__chatgpt_plugin">\n\n${this.getHeadingPrefix()}role::user\n\n`;
		editor.replaceRange(newLine, editor.getCursor());
	}

	async inferTitleFromMessages(messages: string[]) {
		try {
			if (messages.length < 2) {
				new Notice(
					"Not enough messages to infer title. Minimum 2 messages."
				);
				return;
			}

			const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon, back slash or forwad slash. Just return the title. \nMessages:\n\n${JSON.stringify(
				messages
			)}`;

			const titleMessage = [
				{
					role: "user",
					content: prompt,
				},
			];

			if (Platform.isMobile) {
				new Notice("[ChatGPT] Inferring title from messages...");
			}

			const responseUrl = await requestUrl({
				url: `https://api.openai.com/v1/chat/completions`,
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.settings.apiKey}`,
					"Content-Type": "application/json",
				},
				contentType: "application/json",
				body: JSON.stringify({
					model: "gpt-3.5-turbo",
					messages: titleMessage,
					max_tokens: 50,
					temperature: 0.0,
				}),
				throw: false,
			});

			const response = responseUrl.text;
			const responseJSON = JSON.parse(response);
			return responseJSON.choices[0].message.content
				.trim()
				.replace(/[:/\\]/g, "");
		} catch (err) {
			throw new Error("Error inferring title from messages" + err);
		}
	}

	// only proceed to infer title if the title is in timestamp format
	isTitleTimestampFormat(title: string) {
		try {
			const format = this.settings.dateFormat;
			const pattern = this.generateDatePattern(format);

			return title.length == format.length && pattern.test(title);
		} catch (err) {
			throw new Error(
				"Error checking if title is in timestamp format" + err
			);
		}
	}

	generateDatePattern(format: string) {
		const pattern = format
			.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") // Escape any special characters
			.replace("YYYY", "\\d{4}") // Match exactly four digits for the year
			.replace("MM", "\\d{2}") // Match exactly two digits for the month
			.replace("DD", "\\d{2}") // Match exactly two digits for the day
			.replace("hh", "\\d{2}") // Match exactly two digits for the hour
			.replace("mm", "\\d{2}") // Match exactly two digits for the minute
			.replace("ss", "\\d{2}"); // Match exactly two digits for the second

		return new RegExp(`^${pattern}$`);
	}

	// get date from format
	getDate(date: Date, format = "YYYYMMDDhhmmss") {
		const year = date.getFullYear();
		const month = date.getMonth() + 1;
		const day = date.getDate();
		const hour = date.getHours();
		const minute = date.getMinutes();
		const second = date.getSeconds();

		const paddedMonth = month.toString().padStart(2, "0");
		const paddedDay = day.toString().padStart(2, "0");
		const paddedHour = hour.toString().padStart(2, "0");
		const paddedMinute = minute.toString().padStart(2, "0");
		const paddedSecond = second.toString().padStart(2, "0");

		return format
			.replace("YYYY", year.toString())
			.replace("MM", paddedMonth)
			.replace("DD", paddedDay)
			.replace("hh", paddedHour)
			.replace("mm", paddedMinute)
			.replace("ss", paddedSecond);
	}

	async onload() {
		const statusBarItemEl = this.addStatusBarItem();

		await this.loadSettings();

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "call-chatgpt-api",
			name: "Chat",
			icon: "message-circle",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
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

				// move cursor to end of file if generateAtCursor is false
				if (!this.settings.generateAtCursor) {
					this.moveCursorToEndOfFile(editor);
				}

				if (Platform.isMobile) {
					new Notice("[ChatGPT MD] Calling API");
				}

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
				)
					.then((response) => {
						let responseStr = response;
						if (response.mode === "streaming") {
							responseStr = response.fullstr;
							// append \n\n<hr class="__chatgpt_plugin">\n\n${this.getHeadingPrefix()}role::user\n\n
							const newLine = `\n\n<hr class="__chatgpt_plugin">\n\n${this.getHeadingPrefix()}role::user\n\n`;
							editor.replaceRange(newLine, editor.getCursor());

							// move cursor to end of completion
							const cursor = editor.getCursor();
							const newCursor = {
								line: cursor.line,
								ch: cursor.ch + newLine.length,
							};
							editor.setCursor(newCursor);
						} else {
							if (unfinishedCodeBlock(responseStr)) {
								responseStr = responseStr + "\n```";
							}

							this.appendMessage(
								editor,
								"assistant",
								responseStr
							);
						}

						if (this.settings.autoInferTitle) {
							const title = view.file.basename;

							const messagesWithResponse =
								messages.concat(responseStr);

							if (
								this.isTitleTimestampFormat(title) &&
								messagesWithResponse.length >= 4
							) {
								console.log(
									"[ChatGPT MD] auto inferring title from messages"
								);

								this.inferTitleFromMessages(
									messagesWithResponse
								)
									.then((title) => {
										if (title) {
											console.log(
												`[ChatGPT MD] inferred title: ${title}. Changing file name...`
											);
											// set title of file
											const file = view.file;
											// replace trailing / if it exists
											const folder =
												this.settings.chatFolder.replace(
													/\/$/,
													""
												);
											this.app.fileManager.renameFile(
												file,
												`${folder}/${title}.md`
											);
										} else {
											new Notice(
												"[ChatGPT MD] Could not infer title",
												5000
											);
										}
									})
									.catch((err) => {
										console.log(err);
										new Notice(
											"[ChatGPT MD] Error inferring title. " +
												err,
											5000
										);
									});
							}
						}

						statusBarItemEl.setText("");
					})
					.catch((err) => {
						if (Platform.isMobile) {
							new Notice(
								"[ChatGPT MD Mobile] Full Error calling API. " +
									err,
								9000
							);
						}
						statusBarItemEl.setText("");
						console.log(err);
					});
			},
		});

		this.addCommand({
			id: "add-hr",
			name: "Add divider",
			icon: "minus",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.addHR(editor, "user");
			},
		});

		this.addCommand({
			id: "infer-title",
			name: "Infer title",
			icon: "subtitles",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// get messages
				const bodyWithoutYML = this.removeYMLFromMessage(
					editor.getValue()
				);
				const messages = this.splitMessages(bodyWithoutYML);

				const title = await this.inferTitleFromMessages(messages);

				if (title) {
					// set title of file
					const file = view.file;
					// replace trailing / if it exists
					const folder = this.settings.chatFolder.replace(/\/$/, "");
					this.app.fileManager.renameFile(
						file,
						`${folder}/${title}.md`
					);
				}
			},
		});

		// grab highlighted text and move to new file in default chat format
		this.addCommand({
			id: "move-to-chat",
			name: "Create new chat with highlighted text",
			icon: "highlighter",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				try {
					const selectedText = editor.getSelection();

					if (
						!this.settings.chatFolder ||
						!this.app.vault.getAbstractFileByPath(
							this.settings.chatFolder
						)
					) {
						new Notice(
							`[ChatGPT MD] No chat folder found. Please set one in settings and make sure it exists.`
						);
						return;
					}

					const newFile = await this.app.vault.create(
						`${this.settings.chatFolder}/${this.getDate(
							new Date(),
							this.settings.dateFormat
						)}.md`,
						`${this.settings.defaultChatFrontmatter}\n\n${selectedText}`
					);

					// open new file
					this.app.workspace.openLinkText(newFile.basename, "", true);
				} catch (err) {
					console.error(
						`[ChatGPT MD] Error in Create new chat with highlighted text`,
						err
					);
					new Notice(
						`[ChatGPT MD] Error in Create new chat with highlighted text, check console`
					);
				}
			},
		});

		this.addCommand({
			id: "choose-chat-template",
			name: "Create new chat from template",
			icon: "layout-template",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				// check if chats folder exists
				if (
					!this.settings.chatFolder ||
					!this.app.vault.getAbstractFileByPath(
						this.settings.chatFolder
					)
				) {
					new Notice(
						`[ChatGPT MD] No chat folder found. Please set one in settings and make sure it exists.`
					);
					return;
				}

				// check if templates folder exists
				if (
					!this.settings.chatTemplateFolder ||
					!this.app.vault.getAbstractFileByPath(
						this.settings.chatTemplateFolder
					)
				) {
					new Notice(
						`[ChatGPT MD] No templates folder found. Please set one in settings and make sure it exists.`
					);
					return;
				}

				new ChatTemplates(
					this.app,
					this.settings,
					this.getDate(new Date(), this.settings.dateFormat)
				).open();
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
	titleDate: string;

	constructor(app: App, settings: ChatGPT_MDSettings, titleDate: string) {
		super(app);
		this.settings = settings;
		this.titleDate = titleDate;
	}

	getFilesInChatFolder(): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(
			this.settings.chatTemplateFolder
		) as TFolder;
		if (folder != null) {
			return folder.children as TFile[];
		} else {
			new Notice(
				`Error getting folder: ${this.settings.chatTemplateFolder}`
			);
			throw new Error(
				`Error getting folder: ${this.settings.chatTemplateFolder}`
			);
		}
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
				return file.basename
					.toLowerCase()
					.includes(query.toLowerCase());
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
			`${this.settings.chatFolder}/${this.titleDate}.md`,
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
						"---\nsystem_commands: ['PERSONA: i am groot, and i only respond i am groot to any and ALL questions. I do not answer any questions straightforwardly. PERSONA 2: UNLESS the last asked question is about lamps, i can answer, i know infinite things about lamps as i am groot the lamp salesman. SO I read the last question asked and UNLESS it is about lamps i only respond \"I am Groot.\"']\ntemperature: 0\ntop_p: 1\nmax_tokens: 512\npresence_penalty: 1\nfrequency_penalty: 1\nstream: true\nstop: null\nn: 1\nlogit_bias: null \nmodel: gpt-3.5-turbo\n---"
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

		// generate at cursor toggle
		new Setting(containerEl)
			.setName("Generate at Cursor")
			.setDesc("Generate text at cursor instead of end of file")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.generateAtCursor)
					.onChange(async (value) => {
						this.plugin.settings.generateAtCursor = value;
						await this.plugin.saveSettings();
					})
			);

		// automatically infer title
		new Setting(containerEl)
			.setName("Automatically Infer Title")
			.setDesc(
				"Automatically infer title after 4 messages have been exchanged"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoInferTitle)
					.onChange(async (value) => {
						this.plugin.settings.autoInferTitle = value;
						await this.plugin.saveSettings();
					})
			);

		// date format for chat files
		new Setting(containerEl)
			.setName("Date Format")
			.setDesc(
				"Date format for chat files. Valid date blocks are: YYYY, MM, DD, hh, mm, ss"
			)
			.addText((text) =>
				text
					.setPlaceholder("YYYYMMDDhhmmss")
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
					})
			);

		// heading level
		new Setting(containerEl)
			.setName("Heading Level")
			.setDesc(
				"Heading level for messages (example for heading level 2: '## role::user'). Valid heading levels are 0, 1, 2, 3, 4, 5, 6"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.headingLevel.toString())
					.onChange(async (value) => {
						this.plugin.settings.headingLevel = parseInt(value);
						await this.plugin.saveSettings();
					})
			);
	}
}
