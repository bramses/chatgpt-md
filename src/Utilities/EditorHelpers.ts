import { App, Editor, MarkdownView, Notice } from "obsidian";

import { createFolderModal } from "src/Utilities/ModalHelpers";
import { DEFAULT_OPENAI_CONFIG } from "src/Models/OpenAIConfig";
import { ChatGPT_MDSettings, HORIZONTAL_LINE } from "src/Models/Config";

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

export const addHorizontalRuleWithRole = (editor: Editor, role: string, headingPrefix: string): void => {
  const HORIZONTAL_RULE_CLASS = "__chatgpt_plugin";
  const NEWLINE = "\n\n";

  const formattedContent = [
    NEWLINE,
    `<hr class="${HORIZONTAL_RULE_CLASS}">`,
    NEWLINE,
    `${headingPrefix}role::${role}`,
    NEWLINE,
  ].join("");

  const currentPosition = editor.getCursor();

  // Insert the formatted content at current cursor position
  editor.replaceRange(formattedContent, currentPosition);

  // Calculate and set new cursor position
  const newPosition = {
    line: currentPosition.line,
    ch: currentPosition.ch + formattedContent.length,
  };

  editor.setCursor(newPosition);
};

export const getFrontmatter = (view: MarkdownView, settings: ChatGPT_MDSettings, app: App) => {
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    throw new Error("No active file found");
  }

  const metaMatter = app.metadataCache.getFileCache(activeFile)?.frontmatter;
  if (!metaMatter) {
    throw new Error("No frontmatter found in the active file");
  }

  const determineStreamSetting = (): boolean => {
    if (metaMatter.stream !== undefined) return metaMatter.stream;
    if (settings.stream !== undefined) return settings.stream;
    return true;
  };

  return {
    title: metaMatter.title ?? view.file?.basename ?? "Untitled",
    tags: metaMatter.tags ?? [],
    model: metaMatter.model ?? DEFAULT_OPENAI_CONFIG.model,
    temperature: metaMatter.temperature ?? DEFAULT_OPENAI_CONFIG.temperature,
    top_p: metaMatter.top_p ?? DEFAULT_OPENAI_CONFIG.topP,
    presence_penalty: metaMatter.presence_penalty ?? DEFAULT_OPENAI_CONFIG.presencePenalty,
    frequency_penalty: metaMatter.frequency_penalty ?? DEFAULT_OPENAI_CONFIG.frequencyPenalty,
    stream: determineStreamSetting(),
    max_tokens: metaMatter.max_tokens ?? DEFAULT_OPENAI_CONFIG.maxTokens,
    stop: metaMatter.stop ?? null,
    n: metaMatter.n ?? DEFAULT_OPENAI_CONFIG.n,
    logit_bias: metaMatter.logit_bias ?? null,
    user: metaMatter.user ?? null,
    system_commands: metaMatter.system_commands ?? null,
    url: metaMatter.url ?? DEFAULT_OPENAI_CONFIG.url,
  };
};
export const clearConversationExceptFrontmatter = (editor: Editor) => {
  const YAML_FRONTMATTER_REGEX = /---\s*[\s\S]*?\s*---/g;

  try {
    // Extract frontmatter from current content
    const content = editor.getValue();
    const frontmatterMatches = content.match(YAML_FRONTMATTER_REGEX);

    if (!frontmatterMatches || frontmatterMatches.length === 0) {
      throw new Error("No YAML frontmatter found in the document");
    }

    const frontmatter = frontmatterMatches[0];

    // Clear editor and restore frontmatter
    editor.setValue("");
    editor.replaceRange(frontmatter, editor.getCursor());

    // Position cursor at the end of the document
    const newCursorPosition = {
      line: editor.lastLine() + 1,
      ch: 0,
    };

    editor.setCursor(newCursorPosition);
    return newCursorPosition;
  } catch (error) {
    throw new Error(`Failed to clear conversation: ${error.message}`);
  }
};

export const moveCursorToEndOfFile = (editor: Editor) => {
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
};

export const appendMessage = (editor: Editor, role: string, message: string, headingPrefix: string) => {
  const newLine = `\n\n${HORIZONTAL_LINE}\n\n${headingPrefix}role::${role}\n\n${message}\n\n${HORIZONTAL_LINE}\n\n${headingPrefix}role::user\n\n`;
  editor.replaceRange(newLine, editor.getCursor());
};

export const getDate = (date: Date, format = "YYYYMMDDhhmmss") => {
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
};
