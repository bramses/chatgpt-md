export interface OpenAIConfig {
  url: string;
  model: string;
  maxTokens: number;
  titleMaxTokens: number;
  temperature: number;
  titleTemperature: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
  stream: boolean;
  stop: string[] | null;
  n: number;
  logitBias: string | null;
  user: string | null;
}

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  url: "https://api.openai.com/v1/chat/completions",
  model: "gpt-3.5-turbo",
  maxTokens: 250,
  titleMaxTokens: 50,
  temperature: 0.3,
  titleTemperature: 0.0,
  topP: 1,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
  stream: true,
  stop: null,
  n: 1,
  logitBias: null,
  user: null,
};

export const DEFAULT_CHAT_FRONT_MATTER = `---
system_commands: ['I am a helpful assistant.']
temperature: ${DEFAULT_OPENAI_CONFIG.temperature}
top_p: ${DEFAULT_OPENAI_CONFIG.topP}
max_tokens: ${DEFAULT_OPENAI_CONFIG.maxTokens}
presence_penalty: ${DEFAULT_OPENAI_CONFIG.presencePenalty}
frequency_penalty: ${DEFAULT_OPENAI_CONFIG.frequencyPenalty}
stream: ${DEFAULT_OPENAI_CONFIG.stream}
stop: ${DEFAULT_OPENAI_CONFIG.stop}
n: ${DEFAULT_OPENAI_CONFIG.n}
model: ${DEFAULT_OPENAI_CONFIG.model}
---`;
