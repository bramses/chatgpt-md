import { jest } from "@jest/globals";
import { AtlasCloudAdapter } from "./AtlasCloudAdapter";

describe("AtlasCloudAdapter", () => {
  const adapter = new AtlasCloudAdapter();

  it("fetches and prefixes model IDs from the OpenAI-compatible catalog", async () => {
    const makeGetRequest = jest.fn(async () => ({
      data: [
        { id: "deepseek-ai/deepseek-v4-pro", object: "model" },
        { id: "qwen/qwen3.8-max", object: "model" },
      ],
    }));

    await expect(
      adapter.fetchModels("https://api.atlascloud.ai/", "test-key", undefined, makeGetRequest)
    ).resolves.toEqual(["atlascloud@deepseek-ai/deepseek-v4-pro", "atlascloud@qwen/qwen3.8-max"]);
    expect(makeGetRequest).toHaveBeenCalledWith(
      "https://api.atlascloud.ai/v1/models",
      expect.objectContaining({ Authorization: "Bearer test-key" }),
      "atlascloud"
    );
  });

  it("rejects malformed model-list entries", async () => {
    const makeGetRequest = jest.fn(async () => ({ data: [{ id: 123 }, null, "model", {}] }));

    await expect(
      adapter.fetchModels("https://api.atlascloud.ai/v1", "test-key", undefined, makeGetRequest)
    ).resolves.toEqual([]);
  });

  it("does not request models without a credential", async () => {
    const makeGetRequest = jest.fn();

    await expect(adapter.fetchModels("https://api.atlascloud.ai", "", undefined, makeGetRequest)).resolves.toEqual([]);
    expect(makeGetRequest).not.toHaveBeenCalled();
  });
});
