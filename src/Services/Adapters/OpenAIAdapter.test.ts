import { OpenAIAdapter } from "./OpenAIAdapter";

describe("OpenAIAdapter OAuth bridge behavior", () => {
  const adapter = new OpenAIAdapter();

  test("allows custom gateway model fetch in oauth_bridge mode without API key", async () => {
    let capturedArgs: unknown[] | null = null;
    const makeGetRequest = async (url: string, headers: Record<string, string>, provider: string) => {
      capturedArgs = [url, headers, provider];
      return {
        data: [{ id: "chat-model-alpha" }, { id: "gateway-reasoning-v2" }],
      };
    };

    const settings = {
      openaiAuthMode: "oauth_bridge",
    } as any;

    const models = await adapter.fetchModels("https://gateway.example.com", undefined, settings, makeGetRequest);

    expect(models).toEqual(["openai@gateway-reasoning-v2", "openai@chat-model-alpha"]);
    expect(capturedArgs).toEqual([
      "https://gateway.example.com/v1/models",
      { "Content-Type": "application/json" },
      "openai",
    ]);
  });

  test("keeps API key requirement for official OpenAI host even in oauth_bridge mode", async () => {
    let callCount = 0;
    const makeGetRequest = async () => {
      callCount += 1;
      return { data: [] };
    };
    const settings = {
      openaiAuthMode: "oauth_bridge",
    } as any;

    const models = await adapter.fetchModels("https://api.openai.com", undefined, settings, makeGetRequest);

    expect(models).toEqual([]);
    expect(callCount).toBe(0);
  });

  test("uses strict OpenAI filtering for official host in api_key mode", async () => {
    let capturedArgs: unknown[] | null = null;
    const makeGetRequest = async (url: string, headers: Record<string, string>, provider: string) => {
      capturedArgs = [url, headers, provider];
      return {
        data: [
          { id: "gpt-5-mini" },
          { id: "gpt-4.1" },
          { id: "text-embedding-3-large" },
          { id: "gpt-4o-realtime-preview" },
        ],
      };
    };

    const settings = {
      openaiAuthMode: "api_key",
    } as any;

    const models = await adapter.fetchModels("https://api.openai.com", "sk-test-1234567890", settings, makeGetRequest);

    expect(models).toEqual(["openai@gpt-5-mini", "openai@gpt-4.1"]);
    expect(capturedArgs).toEqual([
      "https://api.openai.com/v1/models",
      {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-test-1234567890",
      },
      "openai",
    ]);
  });
});
