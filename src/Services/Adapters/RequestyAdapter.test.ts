import { jest } from "@jest/globals";
import { RequestyAdapter } from "./RequestyAdapter";

describe("RequestyAdapter", () => {
  const adapter = new RequestyAdapter();
  const url = "https://router.requesty.ai";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("lists models from the OpenAI-compatible /v1/models endpoint with the requesty@ prefix", async () => {
    const makeGetRequest = jest
      .fn<(url: string, headers: Record<string, string>, provider: string) => Promise<unknown>>()
      .mockResolvedValue({ data: [{ id: "anthropic/claude-sonnet-4" }, { id: "openai/gpt-4.1-mini" }, { id: 42 }] });

    await expect(adapter.fetchModels(url, "test-key", undefined, makeGetRequest)).resolves.toEqual([
      "requesty@openai/gpt-4.1-mini",
      "requesty@anthropic/claude-sonnet-4",
    ]);
    expect(makeGetRequest).toHaveBeenCalledWith(
      "https://router.requesty.ai/v1/models",
      expect.objectContaining({ Authorization: "Bearer test-key" }),
      "requesty"
    );
  });

  it("returns no models for malformed responses", async () => {
    const makeGetRequest = jest
      .fn<(url: string, headers: Record<string, string>, provider: string) => Promise<unknown>>()
      .mockResolvedValue({ unexpected: true });

    await expect(adapter.fetchModels(url, "test-key", undefined, makeGetRequest)).resolves.toEqual([]);
  });

  it("requires an API key and does not call the network without one", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const makeGetRequest = jest.fn<() => Promise<unknown>>();

    expect(adapter.requiresApiKey()).toBe(true);
    await expect(adapter.fetchModels(url, undefined, undefined, makeGetRequest)).resolves.toEqual([]);
    expect(makeGetRequest).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("strips only its own provider prefix from model ids", () => {
    expect(adapter.extractModelName("requesty@openai/gpt-4.1-mini")).toBe("openai/gpt-4.1-mini");
    expect(adapter.extractModelName("openrouter@openai/gpt-4.1-mini")).toBe("openrouter@openai/gpt-4.1-mini");
  });
});
