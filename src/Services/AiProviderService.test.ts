/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { AiProviderConfig } from "./Adapters/ProviderAdapter";

let AiProviderServiceCtor: typeof import("./AiProviderService").AiProviderService;

beforeAll(async () => {
  (globalThis as any).jest = jest;
  AiProviderServiceCtor = (await import("./AiProviderService")).AiProviderService;
});

function createConfig(overrides: Partial<AiProviderConfig>): AiProviderConfig {
  return {
    provider: "openai",
    model: "openai@gpt-4.1-mini",
    maxTokens: 400,
    temperature: 0.7,
    stream: true,
    url: "https://api.openai.com",
    title: "Untitled",
    system_commands: null,
    tags: null,
    ...overrides,
  };
}

function getProviderOptions(config: AiProviderConfig): unknown {
  const service = new AiProviderServiceCtor() as any;
  service.setProviderFromModel(config.model);
  return service.getProviderOptionsForRequest(config);
}

describe("AiProviderService provider options", () => {
  it("forces system messages for custom OpenAI-compatible URLs", () => {
    const providerOptions = getProviderOptions(
      createConfig({
        model: "openai@deepseek-chat",
        url: "https://api.deepseek.com",
      })
    );

    expect(providerOptions).toEqual({
      openai: {
        systemMessageMode: "system",
      },
    });
  });

  it("keeps the default OpenAI behavior for api.openai.com", () => {
    const providerOptions = getProviderOptions(
      createConfig({
        url: "https://api.openai.com/",
      })
    );

    expect(providerOptions).toBeUndefined();
  });

  it("does not add OpenAI provider options to non-OpenAI adapters", () => {
    const providerOptions = getProviderOptions(
      createConfig({
        provider: "openrouter",
        model: "openrouter@openai/gpt-4.1-mini",
        url: "https://openrouter.ai",
      })
    );

    expect(providerOptions).toBeUndefined();
  });
});
