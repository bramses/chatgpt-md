import { aiProviderFromKeys, aiProviderFromUrl } from "./ProviderHelpers";

describe("Atlas Cloud provider detection", () => {
  it("uses the explicit model prefix", () => {
    expect(aiProviderFromUrl(undefined, "atlascloud@deepseek-ai/deepseek-v4-pro")).toBe("atlascloud");
  });

  it("recognizes the Atlas Cloud API URL", () => {
    expect(aiProviderFromUrl("https://api.atlascloud.ai/v1", "custom-model")).toBe("atlascloud");
  });

  it("uses a configured Atlas Cloud key when no higher-priority key exists", () => {
    expect(aiProviderFromKeys({ atlascloudApiKey: "test-key" })).toBe("atlascloud");
  });
});
