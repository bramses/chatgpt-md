import { jest } from "@jest/globals";
import { requestUrl } from "obsidian";
import { AnthropicAdapter } from "./AnthropicAdapter";

describe("AnthropicAdapter", () => {
  const adapter = new AnthropicAdapter();

  beforeEach(() => {
    (requestUrl as unknown as jest.Mock).mockReset();
  });

  test("fetches models with anthropic prefix when API key is provided", async () => {
    (requestUrl as unknown as jest.Mock).mockResolvedValue({
      json: {
        data: [
          { id: "claude-3-7-sonnet", type: "model" },
          { id: "claude-3-5-haiku", type: "model" },
          { id: "ignored", type: "other" },
        ],
      },
    });

    const models = await adapter.fetchModels(
      "https://api.anthropic.com",
      "anthropic-key",
      { anthropicAuthMode: "api_key" } as any,
      async () => ({})
    );

    expect(models).toEqual(["anthropic@claude-3-5-haiku", "anthropic@claude-3-7-sonnet"]);
    expect((requestUrl as unknown as jest.Mock).mock.calls[0][0]).toMatchObject({
      url: "https://api.anthropic.com/v1/models",
      method: "GET",
      headers: {
        "x-api-key": "anthropic-key",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "Content-Type": "application/json",
      },
    });
  });

  test("subscription mode allows local bridge fetch without API key", async () => {
    (requestUrl as unknown as jest.Mock).mockResolvedValue({
      json: {
        data: [{ id: "claude-sonnet-4", type: "model" }],
      },
    });

    const models = await adapter.fetchModels(
      "http://claude.local:8080",
      undefined,
      { anthropicAuthMode: "subscription" } as any,
      async () => ({})
    );

    expect(models).toEqual(["anthropic@claude-sonnet-4"]);
    const headers = (requestUrl as unknown as jest.Mock).mock.calls[0][0].headers;
    expect(headers["x-api-key"]).toBeUndefined();
  });

  test("subscription mode blocks non-local URL without API key", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const models = await adapter.fetchModels(
        "https://gateway.example.com",
        undefined,
        { anthropicAuthMode: "subscription" } as any,
        async () => ({})
      );

      expect(models).toEqual([]);
      expect(requestUrl).not.toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  test("api_key mode blocks local bridge without API key", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const models = await adapter.fetchModels(
        "http://localhost:8080",
        undefined,
        { anthropicAuthMode: "api_key" } as any,
        async () => ({})
      );

      expect(models).toEqual([]);
      expect(requestUrl).not.toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
