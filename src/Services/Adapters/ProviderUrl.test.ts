import { AnthropicAdapter } from "./AnthropicAdapter";
import { GeminiAdapter } from "./GeminiAdapter";
import { OpenAIAdapter } from "./OpenAIAdapter";
import { OpenRouterAdapter } from "./OpenRouterAdapter";
import { RequestyAdapter } from "./RequestyAdapter";
import { ZaiAdapter } from "./ZaiAdapter";

describe("provider API path suffixes", () => {
  it.each([
    [new OpenAIAdapter(), "https://api.openai.com", "/v1"],
    [new OpenAIAdapter(), "https://example.com/v1", ""],
    [new AnthropicAdapter(), "https://api.anthropic.com", "/v1"],
    [new AnthropicAdapter(), "https://example.com/v1", ""],
    [new GeminiAdapter(), "https://generativelanguage.googleapis.com", "/v1beta"],
    [new GeminiAdapter(), "https://example.com/v1beta", ""],
    [new OpenRouterAdapter(), "https://openrouter.ai", "/api/v1"],
    [new OpenRouterAdapter(), "https://openrouter.ai/api/v1", ""],
    [new RequestyAdapter(), "https://router.requesty.ai", "/v1"],
    [new RequestyAdapter(), "https://router.requesty.ai/v1", ""],
  ])("normalizes %s with %s", (adapter, url, suffix) => {
    expect(adapter.getApiPathSuffix(url)).toBe(suffix);
  });

  it("normalizes both Z.AI endpoint modes without duplicating paths", () => {
    const adapter = new ZaiAdapter();

    expect(adapter.getApiPathSuffix("https://api.z.ai")).toBe("/api/paas/v4");
    expect(adapter.getApiPathSuffix("https://api.z.ai/api/paas/v4")).toBe("");
    expect(adapter.getApiPathSuffix("https://api.z.ai/api/anthropic")).toBe("/v1");
    expect(adapter.getApiPathSuffix("https://api.z.ai/api/anthropic/v1")).toBe("");
  });
});
