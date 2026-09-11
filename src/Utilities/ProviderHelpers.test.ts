import { aiProviderFromKeys, aiProviderFromUrl } from "./ProviderHelpers";

describe("Requesty provider selection", () => {
  it("selects Requesty from the requesty@ model prefix", () => {
    expect(aiProviderFromUrl(undefined, "requesty@openai/gpt-4.1-mini")).toBe("requesty");
    expect(aiProviderFromUrl("https://router.requesty.ai", "openrouter@openai/gpt-4.1-mini")).toBe("openrouter");
  });

  it("selects Requesty from a requesty.ai URL when the model has no prefix", () => {
    expect(aiProviderFromUrl("https://router.requesty.ai/", "openai/gpt-4.1-mini")).toBe("requesty");
  });

  it("is never chosen from configured API keys alone", () => {
    expect(aiProviderFromKeys({ requestyApiKey: "test-key" })).toBeNull();
    expect(aiProviderFromKeys({ requestyApiKey: "test-key", openrouterApiKey: "other-key" })).toBe("openrouter");
  });
});
