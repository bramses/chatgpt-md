import { AI_SERVICES } from "src/Constants";
import {
  createProviderAdapters,
  getCredentialDefinitions,
  getProviderDefinition,
  getProviderDefinitions,
  getProviderFactory,
  getProviderUrl,
} from "./ProviderRegistry";
import { DEFAULT_SETTINGS } from "src/Models/Config";

describe("ProviderRegistry", () => {
  it("defines every supported AI service exactly once", () => {
    const definitions = getProviderDefinitions();
    const providerIds = definitions.map((provider) => provider.id);

    expect(providerIds.sort()).toEqual([...AI_SERVICES].sort());
    expect(new Set(providerIds).size).toBe(providerIds.length);
  });

  it("contains complete operational metadata for every provider", () => {
    for (const provider of getProviderDefinitions()) {
      expect(provider.label).toBeTruthy();
      expect(provider.urlSetting).toBeTruthy();
      expect(provider.defaultUrl).toMatch(/^https?:\/\//);
      expect(provider.defaultConfig).toMatchObject({ aiService: provider.id, url: provider.defaultUrl });
      expect(provider.requiresApiKey).toBe(Boolean(provider.apiKeySetting));
      expect(typeof provider.local).toBe("boolean");
    }
  });

  it("defines complete, unique, stable metadata for every credential category", () => {
    const credentials = getCredentialDefinitions();

    expect(credentials).toHaveLength(7);
    expect(new Set(credentials.map((item) => item.legacySetting)).size).toBe(7);
    expect(new Set(credentials.map((item) => item.secretIdSetting)).size).toBe(7);
    expect(new Set(credentials.map((item) => item.ownedSecretId)).size).toBe(7);
    for (const credential of credentials) {
      expect(credential.ownedSecretId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(DEFAULT_SETTINGS[credential.legacySetting]).toBe("");
      expect(DEFAULT_SETTINGS[credential.secretIdSetting]).toBe("");
    }
  });

  it("creates an adapter for every provider", () => {
    const adapters = createProviderAdapters();

    for (const provider of getProviderDefinitions()) {
      expect(adapters.get(provider.id)?.type).toBe(provider.id);
    }
  });

  it("resolves configured provider URLs with defaults as fallback", () => {
    const openAiProvider = getProviderDefinition("openai");

    expect(getProviderUrl({ ...DEFAULT_SETTINGS, openaiUrl: "" }, openAiProvider)).toBe(openAiProvider.defaultUrl);
    expect(getProviderUrl({ ...DEFAULT_SETTINGS, openaiUrl: "https://example.test" }, openAiProvider)).toBe(
      "https://example.test"
    );
  });

  it("selects the Anthropic-compatible factory for the Z.AI coding endpoint", () => {
    expect(getProviderFactory("zai", "https://api.z.ai/api/anthropic")).not.toBe(
      getProviderFactory("zai", "https://api.z.ai/api/paas/v4")
    );
  });

  it("uses the OpenAI-compatible factory for OrcaRouter", () => {
    expect(getProviderFactory("orcarouter", "https://api.orcarouter.ai")).toBe(
      getProviderFactory("zai", "https://api.z.ai/api/paas/v4")
    );
  });

  it("derives provider frontmatter fields from settings", () => {
    const openAiProvider = getProviderDefinition("openai");
    const fields = openAiProvider.getFrontmatterFields({
      ...DEFAULT_SETTINGS,
      openaiDefaultModel: "openai@test-model",
      openaiDefaultTemperature: 0.2,
    });

    expect(fields.model).toBe("openai@test-model");
    expect(fields.temperature).toBe(0.2);
    expect(fields.max_tokens).toBe(DEFAULT_SETTINGS.openaiDefaultMaxTokens);
  });
});
