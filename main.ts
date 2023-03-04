import {
	App,
	Editor,
	MarkdownView,
	Plugin,
	PluginSettingTab,
	Setting,
	request
} from "obsidian";

// Remember to rename these classes and interfaces!

interface ChatGPT_MDSettings {
	apiKey: string;
}

const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
	apiKey: "default",
};

export default class ChatGPT_MD extends Plugin {
	settings: ChatGPT_MDSettings;

	async callOpenAIAPI(
		editor: Editor,
		messages: {role: string, content: string}[],
		model = "gpt-3.5-turbo",
		max_tokens = 250,
		temperature = 0.3,
		top_p = 1,
		presence_penalty = 0.5,
		frequency_penalty = 0.5,
		stream = true,
		stop = null,
		n = 1,
		logit_bias = null,
		user = null
	) {

		console.log("calling openai api");
		console.log(`args: ${JSON.stringify({
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
			logit_bias: logit_bias,
			user: user,
		}, null, 2)}`)

		// return "hello world";

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
				// max_tokens: max_tokens,
				// temperature: temperature,
				// top_p: top_p,
				// presence_penalty: presence_penalty,
				// frequency_penalty: frequency_penalty,
				stream: stream,
				// stop: stop,
				// n: n,
				// logit_bias: logit_bias,
				// user: user,
			}),
		});

		console.log(response);

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

			console.log(responseLines.filter((line) => line && line.includes("`")).map((line) => JSON.parse(line).choices[0].delta.content));

			const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::assistant\n\n`;
			editor.replaceRange(newLine, editor.getCursor());

			// move cursor to end of file
			const cursor = editor.getCursor();
			const newCursor = {
				line: cursor.line,
				ch: cursor.ch + newLine.length
			}
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
							await new Promise(r => setTimeout(r, 82)); // what in the actual fuck -- why does this work 

						} else {
							editor.replaceRange(delta, cursor);
							await new Promise(r => setTimeout(r, 28));

						}

						const newCursor = {
							line: cursor.line,
							ch: cursor.ch + delta.length
						}
						editor.setCursor(newCursor);
						
						fullstr += delta;

					}
				}
			}

			console.log(fullstr)

			return "streaming";
		} else {
			const responseJSON = JSON.parse(response);
			return responseJSON.choices[0].message.content;
		}
	}

	splitMessages(text: string) {
		// <hr class="__chatgpt_plugin">
		const messages = text.split('<hr class="__chatgpt_plugin">');
		return messages;
	}

	extractRoleAndMessage(message: string) {

		/*
		extract role from message
		role::assistant


		message content (can be multiple lines)
		*/

		try {
			const role = message.split("role::")[1].split("\n")[0];
			const content = message.split("role::")[1].split("\n").slice(1).join("\n");
			return {role, content};
		} catch (err) {
			throw new Error("Error extracting role and message");
		}


	}

	appendMessage(editor: Editor, role: string, message: string) {
		/*
		 append to bottom of editor file:
		 	const newLine = `${lineBeforeCursor}<hr class="__chatgpt_plugin">\nrole::${role}\n\n${message}`;
		*/

		const lineBeforeCursor = editor.getLine(editor.getCursor().line);
		const newLine = `${lineBeforeCursor}\n\n<hr class="__chatgpt_plugin">\n\nrole::${role}\n\n${message}\n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n`;
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
				const messages = this.splitMessages(editor.getValue());
				const messagesWithRoleAndMessage = messages.map((message) => {
					return this.extractRoleAndMessage(message);
				});
				this.callOpenAIAPI(editor, messagesWithRoleAndMessage).then((response) => {
					if (response === "streaming") {
						// append \n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n
						const newLine = `\n\n<hr class="__chatgpt_plugin">\n\nrole::user\n\n`;
						editor.replaceRange(newLine, editor.getCursor());

						// move cursor to end of file
						const cursor = editor.getCursor();
						const newCursor = {
							line: cursor.line,
							ch: cursor.ch + newLine.length
						}
						editor.setCursor(newCursor);
					} else {
						this.appendMessage(editor, "assistant", response);
					}
				});
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

		containerEl.createEl("h2", { text: "Settings for ChatGPT MD:" });

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
	}
}
