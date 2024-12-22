export const DEFAULT_URL = "https://api.openai.com/v1/chat/completions";

export const DEFAULT_CHAT_FRONTMATTER = `---
system_commands: ['I am a helpful assistant.']
temperature: 0
top_p: 1
max_tokens: 512
presence_penalty: 1
frequency_penalty: 1
stream: true
stop: null
n: 1
model: gpt-3.5-turbo
---`;

export const DATE_FORMAT = "YYYYMMDDhhmmss";
