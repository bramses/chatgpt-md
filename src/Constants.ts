// Plugin name constant
export const PLUGIN_NAME = "ChatGPT MD";
export const PLUGIN_PREFIX = `[${PLUGIN_NAME}]`;

// AI service identifiers
export const AI_SERVICE_OLLAMA = "ollama";
export const AI_SERVICE_OPENAI = "openai";
export const AI_SERVICE_OPENROUTER = "openrouter";
export const AI_SERVICE_LMSTUDIO = "lmstudio";
export const AI_SERVICE_ANTHROPIC = "anthropic";
export const AI_SERVICE_GEMINI = "gemini";

// API endpoints for each service
export const API_ENDPOINTS = {
  [AI_SERVICE_OPENAI]: "/v1/chat/completions",
  [AI_SERVICE_OPENROUTER]: "/api/v1/chat/completions",
  [AI_SERVICE_OLLAMA]: "/api/chat",
  [AI_SERVICE_LMSTUDIO]: "/v1/chat/completions",
  [AI_SERVICE_ANTHROPIC]: "/v1/messages",
  [AI_SERVICE_GEMINI]: "/v1beta/models/{model}:generateContent",
};

export const ADD_COMMENT_BLOCK_COMMAND_ID = "add-comment-block";
export const ADD_HR_COMMAND_ID = "add-hr";
export const CALL_CHATGPT_API_COMMAND_ID = "call-chatgpt-api";
export const STOP_STREAMING_COMMAND_ID = "stop-streaming";
export const MOVE_TO_CHAT_COMMAND_ID = "move-to-chat";
export const INFER_TITLE_COMMAND_ID = "infer-title";
export const CHOOSE_CHAT_TEMPLATE_COMMAND_ID = "choose-chat-template";
export const CLEAR_CHAT_COMMAND_ID = "clear-chat";

export const CHAT_ERROR_MESSAGE_401 =
  "I am sorry. There was an authorization issue with the external API (Status 401).\nPlease check your API key in the settings or set your default model in the settings if you use Ollama or LM Studio";
export const CHAT_ERROR_MESSAGE_NO_CONNECTION =
  "I am sorry. There was an issue reaching the network.\nPlease check your network connection.";
export const CHAT_ERROR_MESSAGE_404 =
  "I am sorry, your request looks wrong. Please check your URL or model name in the settings or frontmatter.";
export const CHAT_ERROR_RESPONSE =
  "I am sorry, I could not answer your request because of an error, here is what went wrong:";

export const CHAT_FOLDER_TYPE = "chatFolder";
export const CHAT_TEMPLATE_FOLDER_TYPE = "chatTemplateFolder";

export const NEWLINE = "\n\n";
export const WIKI_LINKS_REGEX = /\[\[([^\][]+)\]\]/g;
export const MARKDOWN_LINKS_REGEX = /\[([^\]]+)\]\(([^()]+)\)/g;

export const COMMENT_BLOCK_START = `=begin-chatgpt-md-comment${NEWLINE}`;
export const COMMENT_BLOCK_END = `=end-chatgpt-md-comment`;

export const DEFAULT_HEADING_LEVEL = 3;
export const MAX_HEADING_LEVEL = 6;
export const DEFAULT_INFER_TITLE_LANGUAGE = "English";
export const MIN_AUTO_INFER_MESSAGES = 4;
export const DEFAULT_DATE_FORMAT = "YYYYMMDDhhmmss";

export const ERROR_NO_CONNECTION = "Failed to fetch";

export const HORIZONTAL_LINE_CLASS = "__chatgpt_plugin";
export const HORIZONTAL_LINE_MD = `<hr class="${HORIZONTAL_LINE_CLASS}">`;

export const ROLE_IDENTIFIER = "role::";
export const ROLE_ASSISTANT = "assistant";
export const ROLE_DEVELOPER = "developer";
export const ROLE_SYSTEM = "system";
export const ROLE_USER = "user";

export const FETCH_MODELS_TIMEOUT_MS = 6000;
export const NOTICE_DURATION_SHORT_MS = 6000; // Short notification duration (6 seconds)
export const NOTICE_DURATION_LONG_MS = 9000; // Long notification duration (9 seconds)

// Plugin-specific system message to help LLM understand the context
export const PLUGIN_SYSTEM_MESSAGE = `You're chatting with a user in Obsidian, a knowledge management system where they organize notes in interconnected Markdown files. This conversation appears as a chat within their active document.

Be helpful and concise. Use proper Markdown: \`\`\`language for code blocks, \`inline\` for code/filenames. Support [[Internal Links]] and [external links](url). Consider this chat is part of their personal knowledge base.

When appropriate, end with an open question to keep the conversation helpful and make contextual offers based on their last message.`;

// Truncation error messages
export const TRUNCATION_ERROR_FULL =
  "⚠️ **Response was truncated due to token limit.** Please increase the `max_tokens` setting in ChatGPT MD plugin settings to get the complete response.";
export const TRUNCATION_ERROR_PARTIAL =
  "⚠️ *Note: Some alternative responses were truncated due to token limit. Consider increasing `max_tokens` in settings for fuller responses.*";
export const TRUNCATION_ERROR_INDICATOR = "Response was truncated due to token limit";
export const TITLE_INFERENCE_ERROR_HEADER = "⚠️ Title Inference Error";
