import { jest } from "@jest/globals";
import { OpenAICodexAdapter } from "./OpenAICodexAdapter";

describe("OpenAICodexAdapter", () => {
  const adapter = new OpenAICodexAdapter();

  test("fetches models from the local bridge with openai-codex prefix", async () => {
    let capturedArgs: unknown[] | null = null;
    const makeGetRequest = async (url: string, headers: Record<string, string>, provider: string) => {
      capturedArgs = [url, headers, provider];
      return {
        data: [{ id: "gpt-5.2-codex" }, { id: "gpt-5.2-codex-max" }, { id: "" }, { nope: "missing-id" }],
      };
    };

    const models = await adapter.fetchModels(
      "http://openai-codex.local:1455",
      "local-bridge-token",
      undefined,
      makeGetRequest
    );

    expect(models).toEqual(["openai-codex@gpt-5.2-codex-max", "openai-codex@gpt-5.2-codex"]);
    expect(capturedArgs).toEqual([
      "http://openai-codex.local:1455/v1/models",
      {
        "Content-Type": "application/json",
        Authorization: "Bearer local-bridge-token",
      },
      "openai-codex",
    ]);
  });

  test("fetches models from local bridge without token for native/session auth", async () => {
    let capturedArgs: unknown[] | null = null;
    const makeGetRequest = async (url: string, headers: Record<string, string>, provider: string) => {
      capturedArgs = [url, headers, provider];
      return {
        data: [{ id: "gpt-5.4" }],
      };
    };

    const models = await adapter.fetchModels(
      "http://openai-codex.local:1455",
      undefined,
      { openaiCodexAuthMode: "native" } as any,
      makeGetRequest
    );

    expect(models).toEqual(["openai-codex@gpt-5.4"]);
    expect(capturedArgs).toEqual([
      "http://openai-codex.local:1455/v1/models",
      {
        "Content-Type": "application/json",
      },
      "openai-codex",
    ]);
  });

  test("does not fetch models from non-local bridge without token", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let callCount = 0;
    const makeGetRequest = async () => {
      callCount += 1;
      return { data: [] };
    };

    try {
      const models = await adapter.fetchModels(
        "https://gateway.example.com",
        undefined,
        { openaiCodexAuthMode: "native" } as any,
        makeGetRequest
      );

      expect(models).toEqual([]);
      expect(callCount).toBe(0);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test("disables tool calling until bridge compatibility is verified", () => {
    expect(adapter.supportsToolCalling()).toBe(false);
  });

  test("does not require API key globally", () => {
    expect(adapter.requiresApiKey()).toBe(false);
  });

  test("token-only mode blocks local bridge fetch without token", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let callCount = 0;
    const makeGetRequest = async () => {
      callCount += 1;
      return { data: [] };
    };

    try {
      const models = await adapter.fetchModels(
        "http://openai-codex.local:1455",
        undefined,
        { openaiCodexAuthMode: "token" } as any,
        makeGetRequest
      );

      expect(models).toEqual([]);
      expect(callCount).toBe(0);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
