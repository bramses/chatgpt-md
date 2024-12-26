export interface Chat_MD_FrontMatter {
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
  url: string;
}
