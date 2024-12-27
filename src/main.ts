/* eslint-disable @typescript-eslint/no-var-requires */
import { Editor, MarkdownView, Notice, Platform, Plugin, requestUrl } from "obsidian";

import { StreamManager } from "src/stream";
import { ChatGPT_MDSettingsTab } from "src/Views/ChatGPT_MDSettingsTab";
import {
  addHorizontalRuleWithRole,
  appendMessage,
  clearConversationExceptFrontmatter,
  ensureFolderExists,
  getDate,
  getFrontmatter,
  moveCursorToEndOfFile,
  writeInferredTitleToEditor,
} from "src/Utilities/EditorHelpers";
import {
  extractRoleAndMessage,
  getHeadingPrefix,
  isTitleTimestampFormat,
  removeCommentsFromMessages,
  removeYAMLFrontMatter,
  splitMessages,
  unfinishedCodeBlock,
} from "src/Utilities/TextHelpers";
import { ChatTemplates } from "src/Views/ChatTemplates";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS, HORIZONTAL_LINE } from "src/Models/Config";
import {
  DEFAULT_FREQUENCY_PENALTY,
  DEFAULT_LOGIT_BIAS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_N,
  DEFAULT_PRESENCE_PENALTY,
  DEFAULT_STOP,
  DEFAULT_STREAM,
  DEFAULT_TEMPERATURE,
  DEFAULT_TITLE_MAX_TOKENS,
  DEFAULT_TITLE_TEMPERATURE,
  DEFAULT_TOP_P,
  DEFAULT_URL,
  DEFAULT_USER,
} from "src/Models/OpenAIConfig";
import { Message } from "src/Models/Message";

export default class ChatGPT_MD extends Plugin {
  settings: ChatGPT_MDSettings;

  async callOpenAIAPI(
    streamManager: StreamManager,
    editor: Editor,
    messages: Message[],
    model = DEFAULT_MODEL,
    max_tokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    top_p = DEFAULT_TOP_P,
    presence_penalty = DEFAULT_PRESENCE_PENALTY,
    frequency_penalty = DEFAULT_FREQUENCY_PENALTY,
    stream = DEFAULT_STREAM,
    stop: string[] | null = DEFAULT_STOP,
    n = DEFAULT_N,
    logit_bias: string | null = DEFAULT_LOGIT_BIAS,
    user: string | null = DEFAULT_USER,
    url = DEFAULT_URL
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

        const response = await streamManager.streamSSE(
          editor,
          this.settings.apiKey,
          url,
          options,
          this.settings.generateAtCursor,
          getHeadingPrefix(this.settings.headingLevel)
        );

        console.log("response from stream", response);

        return { fullstr: response, mode: "streaming" };
      } else {
        const responseUrl = await requestUrl({
          url: url,
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
            new Notice(`[ChatGPT MD] Stream = False Error :: ${json.error.message}`);
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
          if (url !== DEFAULT_URL) {
            new Notice("[ChatGPT MD] Issue calling specified url: " + url);
            throw new Error("[ChatGPT MD] Issue calling specified url: " + url);
          } else {
            new Notice(`[ChatGPT MD] Error :: ${JSON.stringify(err)}`);
            throw new Error(JSON.stringify(err));
          }
        }
      }

      new Notice("issue calling OpenAI API, see console for more details");
      throw new Error("issue calling OpenAI API, see error for more details: " + err);
    }
  }

  async inferTitleFromMessages(messages: string[]) {
    console.log("[ChtGPT MD] Inferring Title");
    new Notice("[ChatGPT] Inferring title from messages...");

    try {
      if (messages.length < 2) {
        new Notice("Not enough messages to infer title. Minimum 2 messages.");
        return;
      }

      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon, back slash or forward slash. Just return the title. Write the title in ${
        this.settings.inferTitleLanguage
      }. \nMessages:\n\n${JSON.stringify(messages)}`;

      const titleMessage = [
        {
          role: "user",
          content: prompt,
        },
      ];

      const responseUrl = await requestUrl({
        url: DEFAULT_URL,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`,
          "Content-Type": "application/json",
        },
        contentType: "application/json",
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: titleMessage,
          max_tokens: DEFAULT_TITLE_MAX_TOKENS,
          temperature: DEFAULT_TITLE_TEMPERATURE,
        }),
        throw: false,
      });

      const response = responseUrl.text;
      const responseJSON = JSON.parse(response);
      return responseJSON.choices[0].message.content
        .replace(/[:/\\]/g, "")
        .replace("Title", "")
        .replace("title", "")
        .trim();
    } catch (err) {
      new Notice("[ChatGPT MD] Error inferring title from messages");
      throw new Error("[ChatGPT MD] Error inferring title from messages" + err);
    }
  }

  async onload() {
    const statusBarItemEl = this.addStatusBarItem();

    await this.loadSettings();

    const streamManager = new StreamManager();

    // This adds an editor command that can perform some operation on the current editor instance
    this.addCommand({
      id: "call-chatgpt-api",
      name: "Chat",
      icon: "message-circle",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        statusBarItemEl.setText("[ChatGPT MD] Calling API...");
        // get frontmatter
        const frontmatter = getFrontmatter(view, this.settings, this.app);

        // get messages
        const bodyWithoutYML = removeYAMLFrontMatter(editor.getValue());
        let messages = splitMessages(bodyWithoutYML);
        messages = messages.map((message) => {
          return removeCommentsFromMessages(message);
        });

        const messagesWithRoleAndMessage = messages.map((message) => {
          return extractRoleAndMessage(message);
        });

        if (frontmatter.system_commands) {
          const systemCommands = frontmatter.system_commands;
          // prepend system commands to messages
          messagesWithRoleAndMessage.unshift(
            ...systemCommands.map((command: string) => {
              return {
                role: "system",
                content: command,
              };
            })
          );
        }

        // move cursor to end of file if generateAtCursor is false
        if (!this.settings.generateAtCursor) {
          moveCursorToEndOfFile(editor);
        }

        if (Platform.isMobile) {
          new Notice("[ChatGPT MD] Calling API");
        }

        this.callOpenAIAPI(
          streamManager,
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
          frontmatter.user,
          frontmatter.url
        )
          .then((response) => {
            let responseStr = response;
            if (response.mode === "streaming") {
              responseStr = response.fullstr;
              const newLine = `\n\n${HORIZONTAL_LINE}\n\n${getHeadingPrefix(this.settings.headingLevel)}role::user\n\n`;
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

              appendMessage(editor, "assistant", responseStr, getHeadingPrefix(this.settings.headingLevel));
            }

            if (this.settings.autoInferTitle) {
              if (!view.file) {
                throw new Error("No active file found");
              }
              const title = view.file.basename;

              let messagesWithResponse = messages.concat(responseStr);
              messagesWithResponse = messagesWithResponse.map((message) => {
                return removeCommentsFromMessages(message);
              });

              if (isTitleTimestampFormat(title, this.settings.dateFormat) && messagesWithResponse.length >= 4) {
                console.log("[ChatGPT MD] auto inferring title from messages");

                statusBarItemEl.setText("[ChatGPT MD] Calling API...");
                this.inferTitleFromMessages(messagesWithResponse)
                  .then(async (title) => {
                    if (title) {
                      console.log(`[ChatGPT MD] automatically inferred title: ${title}. Changing file name...`);
                      statusBarItemEl.setText("");

                      await writeInferredTitleToEditor(this.app, view, this.settings.chatFolder, title);
                    } else {
                      new Notice("[ChatGPT MD] Could not infer title", 5000);
                    }
                  })
                  .catch((err) => {
                    console.log(err);
                    statusBarItemEl.setText("");
                    if (Platform.isMobile) {
                      new Notice("[ChatGPT MD] Error inferring title. " + err, 5000);
                    }
                  });
              }
            }

            statusBarItemEl.setText("");
          })
          .catch((err) => {
            if (Platform.isMobile) {
              new Notice("[ChatGPT MD Mobile] Full Error calling API. " + err, 9000);
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
        addHorizontalRuleWithRole(editor, "user", getHeadingPrefix(this.settings.headingLevel));
      },
    });

    this.addCommand({
      id: "add-comment-block",
      name: "Add comment block",
      icon: "comment",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        // add a comment block at cursor in format: =begin-chatgpt-md-comment and =end-chatgpt-md-comment
        const cursor = editor.getCursor();
        const line = cursor.line;
        const ch = cursor.ch;

        const commentBlock = `=begin-chatgpt-md-comment\n\n=end-chatgpt-md-comment`;
        editor.replaceRange(commentBlock, cursor);

        // move cursor to middle of comment block
        const newCursor = {
          line: line + 1,
          ch: ch,
        };
        editor.setCursor(newCursor);
      },
    });

    this.addCommand({
      id: "stop-streaming",
      name: "Stop streaming",
      icon: "octagon",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        streamManager.stopStreaming();
      },
    });

    this.addCommand({
      id: "infer-title",
      name: "Infer title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        // get messages
        const bodyWithoutYML = removeYAMLFrontMatter(editor.getValue());
        let messages = splitMessages(bodyWithoutYML);
        messages = messages.map((message) => {
          return removeCommentsFromMessages(message);
        });

        statusBarItemEl.setText("[ChatGPT MD] Calling API...");
        const title = await this.inferTitleFromMessages(messages);
        statusBarItemEl.setText("");

        if (title) {
          await writeInferredTitleToEditor(this.app, view, this.settings.chatFolder, title);
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

          if (!this.settings.chatFolder || this.settings.chatFolder.trim() === "") {
            new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
            return;
          }

          const chatFolderExists = await ensureFolderExists(this.app, this.settings.chatFolder, "chatFolder");
          if (!chatFolderExists) {
            return;
          }

          const newFile = await this.app.vault.create(
            `${this.settings.chatFolder}/${getDate(new Date(), this.settings.dateFormat)}.md`,
            `${this.settings.defaultChatFrontmatter}\n\n${selectedText}`
          );

          // open new file
          await this.app.workspace.openLinkText(newFile.basename, "", true, { state: { mode: "source" } });
          const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

          if (!activeView) {
            new Notice("No active markdown editor found.");
            return;
          }

          activeView.editor.focus();
          moveCursorToEndOfFile(activeView.editor);
        } catch (err) {
          console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
          new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
        }
      },
    });

    this.addCommand({
      id: "choose-chat-template",
      name: "Create new chat from template",
      icon: "layout-template",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (!this.settings.chatFolder || this.settings.chatFolder.trim() === "") {
          new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
          return;
        }

        const chatFolderExists = await ensureFolderExists(this.app, this.settings.chatFolder, "chatFolder");
        if (!chatFolderExists) {
          return;
        }

        if (!this.settings.chatTemplateFolder || this.settings.chatTemplateFolder.trim() === "") {
          new Notice(`[ChatGPT MD] No chat template folder value found. Please set one in settings.`);
          return;
        }

        const chatTemplateFolderExists = await ensureFolderExists(
          this.app,
          this.settings.chatTemplateFolder,
          "chatTemplateFolder"
        );
        if (!chatTemplateFolderExists) {
          return;
        }

        new ChatTemplates(this.app, this.settings, getDate(new Date(), this.settings.dateFormat)).open();
      },
    });

    this.addCommand({
      id: "clear-chat",
      name: "Clear chat (except frontmatter)",
      icon: "trash",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        clearConversationExceptFrontmatter(editor);
      },
    });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ChatGPT_MDSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
