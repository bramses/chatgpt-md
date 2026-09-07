import { jest } from "@jest/globals";
import { DEFAULT_SETTINGS, ChatGPT_MDSettings } from "src/Models/Config";
import { ApiAuthService } from "./ApiAuthService";
import { getCredentialDefinitions } from "./Providers/ProviderRegistry";

class FakeSecretComponent {
  constructor(_app: never, _container: never) {}
}

function createStorage(initial: Record<string, unknown> = {}) {
  const secrets = new Map<string, unknown>(Object.entries(initial));
  return {
    secrets,
    setSecret: jest.fn((id: string, value: string) => secrets.set(id, value)),
    getSecret: jest.fn((id: string) => secrets.get(id) ?? null),
    listSecrets: jest.fn(() => [...secrets.keys()]),
  };
}

function createSupported(initial: Record<string, unknown> = {}) {
  const storage = createStorage(initial);
  return { storage, service: new ApiAuthService({ secretStorage: storage }, FakeSecretComponent) };
}

function allPlaintextSettings(): ChatGPT_MDSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  for (const definition of getCredentialDefinitions()) {
    (settings as unknown as Record<string, unknown>)[definition.legacySetting] = `synthetic-${definition.category}`;
  }
  return settings;
}

describe("ApiAuthService secure credentials", () => {
  it("requires independently valid storage and UI capabilities", () => {
    const storage = createStorage();
    expect(new ApiAuthService({ secretStorage: storage }, undefined).isSecureStorageSupported()).toBe(false);
    expect(new ApiAuthService({}, FakeSecretComponent).isSecureStorageSupported()).toBe(false);
    expect(new ApiAuthService({ secretStorage: storage }, () => undefined).isSecureStorageSupported()).toBe(false);
    expect(new ApiAuthService({ secretStorage: storage }, FakeSecretComponent).isSecureStorageSupported()).toBe(true);
    expect(
      new ApiAuthService(
        { secretStorage: { ...storage, listSecrets: "malformed" } },
        FakeSecretComponent
      ).isSecureStorageSupported()
    ).toBe(false);
    expect(
      new ApiAuthService(
        Object.defineProperty({}, "secretStorage", {
          get: () => {
            throw new Error("malformed capability");
          },
        }),
        FakeSecretComponent
      ).isSecureStorageSupported()
    ).toBe(false);
  });

  it("migrates all six categories independently and persists references only", async () => {
    const { storage, service } = createSupported();
    const settings = allPlaintextSettings();
    const snapshots: ChatGPT_MDSettings[] = [];

    const summary = await service.migrateLegacyCredentials(settings, async () => {
      snapshots.push(structuredClone(settings));
    });

    expect(summary.results.every((result) => result.status === "migrated")).toBe(true);
    expect(snapshots).toHaveLength(7);
    for (const definition of getCredentialDefinitions()) {
      expect(settings[definition.legacySetting]).toBe("");
      expect(settings[definition.secretIdSetting]).toBe(definition.ownedSecretId);
      expect(storage.secrets.get(definition.ownedSecretId)).toBe(`synthetic-${definition.category}`);
    }
    expect(JSON.stringify(settings)).not.toContain("synthetic-");
  });

  it("skips blank values and converges across ten migration runs", async () => {
    const { storage, service } = createSupported();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.apiKey = "  ";
    settings.anthropicApiKey = "synthetic-anthropic";
    const persist = jest.fn(async () => undefined);

    for (let run = 0; run < 10; run++) await service.migrateLegacyCredentials(settings, persist);

    expect(storage.setSecret).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(storage.secrets.size).toBe(1);
  });

  it("prefers valid references and preserves mixed plaintext until explicit cleanup", async () => {
    const definition = getCredentialDefinitions()[0];
    const { storage, service } = createSupported({ selected: "secure-value" });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.apiKeySecretId = "selected";
    settings.apiKey = "insecure-copy";

    const summary = await service.migrateLegacyCredentials(settings, async () => undefined);

    expect(service.getApiKey(settings, "openai")).toBe("secure-value");
    expect(settings.apiKey).toBe("insecure-copy");
    expect(summary.results.find((result) => result.category === definition.category)?.status).toBe("preserved");
    expect(storage.setSecret).not.toHaveBeenCalled();
  });

  it("replaces an invalid reference and overwrites the deterministic owned ID", async () => {
    const definition = getCredentialDefinitions()[0];
    const { storage, service } = createSupported({
      missing: null,
      [definition.ownedSecretId]: "stale-owned-value",
    });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.apiKeySecretId = "missing";
    settings.apiKey = "authoritative-plaintext";

    await service.migrateLegacyCredentials(settings, async () => undefined);

    expect(storage.secrets.get(definition.ownedSecretId)).toBe("authoritative-plaintext");
    expect(settings.apiKeySecretId).toBe(definition.ownedSecretId);
    expect(settings.apiKey).toBe("");
  });

  it("uses no more than one reference lookup and one write per category in a pass", async () => {
    const { storage, service } = createSupported({ missing: null });
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.apiKey = "synthetic-openai";
    settings.apiKeySecretId = "missing";

    await service.migrateLegacyCredentials(settings, async () => undefined);

    expect(storage.getSecret).toHaveBeenCalledTimes(1);
    expect(storage.setSecret).toHaveBeenCalledTimes(1);
  });

  it("rolls back a failed save, continues, and keeps plaintext authentication usable", async () => {
    const { service } = createSupported();
    const settings = allPlaintextSettings();
    let saves = 0;

    const summary = await service.migrateLegacyCredentials(settings, async () => {
      saves++;
      if (saves === 1) throw new Error("synthetic persistence failure");
    });

    expect(summary.results[0].status).toBe("failed");
    expect(summary.results.slice(1).every((result) => result.status === "migrated")).toBe(true);
    expect(settings.apiKey).toBe("synthetic-openai");
    expect(settings.apiKeySecretId).toBe("");
    expect(service.getApiKey(settings, "openai")).toBe("synthetic-openai");
  });

  it("uses legacy values for every partial capability and never returns reference IDs", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.apiKey = "legacy-key";
    settings.apiKeySecretId = "reference-id";
    const storage = createStorage({ "reference-id": "secure-key" });

    expect(new ApiAuthService({ secretStorage: storage }).getApiKey(settings, "openai")).toBe("legacy-key");
    expect(new ApiAuthService({}, FakeSecretComponent).getApiKey(settings, "openai")).toBe("legacy-key");
    settings.apiKey = "";
    expect(new ApiAuthService().getApiKey(settings, "openai")).toBe("");
  });

  it("treats malformed persisted values and lookup results as absent", () => {
    const { service } = createSupported({ valid: { secret: "not-a-string" } });
    const settings = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
    settings.apiKey = null;
    settings.apiKeySecretId = "valid";

    expect(service.getApiKey(settings as unknown as ChatGPT_MDSettings, "openai")).toBe("");
    settings.apiKeySecretId = "INVALID REFERENCE";
    settings.apiKey = 42;
    expect(service.getApiKey(settings as unknown as ChatGPT_MDSettings, "openai")).toBe("");
  });

  it("never includes values or IDs in migration summaries", async () => {
    const { service } = createSupported();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.apiKey = "synthetic-super-secret";

    const summary = await service.migrateLegacyCredentials(settings, async () => undefined);
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toContain("synthetic-super-secret");
    expect(serialized).not.toContain("chatgpt-md-openai-api-key");
  });
});
