export interface OpenAIConfig {
  frequencyPenalty: number;
  logitBias: string | null;
  maxTokens: number;
  model: string;
  n: number;
  presencePenalty: number;
  stop: string[] | null;
  stream: boolean;
  system_commands: string[] | null;
  tags: string[] | null;
  temperature: number;
  title: string;
  titleMaxTokens: number;
  titleTemperature: number;
  topP: number;
  url: string;
  user: string | null;
}

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  frequencyPenalty: 0.5,
  logitBias: null,
  maxTokens: 250,
  model: "gpt-3.5-turbo",
  n: 1,
  presencePenalty: 0.5,
  stop: null,
  stream: true,
  system_commands: null,
  tags: [],
  temperature: 0.3,
  title: "Untitled",
  titleMaxTokens: 50,
  titleTemperature: 0.0,
  topP: 1,
  url: "https://api.openai.com/v1/chat/completions",
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
