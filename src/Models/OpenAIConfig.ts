// Default API configuration
export const DEFAULT_URL = `https://api.openai.com/v1/chat/completions`;
export const DEFAULT_MODEL = "gpt-3.5-turbo";

// Default parameters for OpenAI API calls
export const DEFAULT_MAX_TOKENS = 250;
export const DEFAULT_TITLE_MAX_TOKENS = 50;
export const DEFAULT_TEMPERATURE = 0.3;
export const DEFAULT_TITLE_TEMPERATURE = 0.0;
export const DEFAULT_TOP_P = 1;
export const DEFAULT_PRESENCE_PENALTY = 0.5;
export const DEFAULT_FREQUENCY_PENALTY = 0.5;
export const DEFAULT_STREAM = true;
export const DEFAULT_STOP: string[] | null = null;
export const DEFAULT_N = 1;
export const DEFAULT_LOGIT_BIAS: string | null = null;
export const DEFAULT_USER: string | null = null;

export const DEFAULT_CHAT_FRONT_MATTER = `---
system_commands: ['I am a helpful assistant.']
temperature: ${DEFAULT_TEMPERATURE}
top_p: ${DEFAULT_TOP_P}
max_tokens: ${DEFAULT_MAX_TOKENS}
presence_penalty: ${DEFAULT_PRESENCE_PENALTY}
frequency_penalty: ${DEFAULT_FREQUENCY_PENALTY}
stream: ${DEFAULT_STREAM}
stop: ${DEFAULT_STOP}
n: ${DEFAULT_N}
model: ${DEFAULT_MODEL}
---`;
