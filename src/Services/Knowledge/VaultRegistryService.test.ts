import { App } from "obsidian";
import { MemoryVaultStore } from "./KnowledgeFileStore";
import { NodeRuntime } from "./NodeRuntime";
import { buildKeywords, VaultRegistryService } from "./VaultRegistryService";

function appWithVault(name: string): App {
  return {
    vault: {
      getName: () => name,
      adapter: { basePath: `/vaults/${name}` },
    },
  } as unknown as App;
}

/** Stub runtime that serves one fake obsidian.json. */
function runtimeWithVaults(paths: string[]): NodeRuntime {
  return {
    isAvailable: () => true,
    obsidianConfigCandidates: () => ["/config/obsidian.json"],
    path: { basename: (value: string) => value.split("/").pop() || value },
    fs: {
      promises: {
        readFile: async () =>
          JSON.stringify({ vaults: Object.fromEntries(paths.map((path, index) => [index, { path }])) }),
      },
    },
  } as unknown as NodeRuntime;
}

describe("VaultRegistryService", () => {
  it("always knows the vault that is currently open", () => {
    const service = new VaultRegistryService(appWithVault("Mybrain.Leander"), {
      isAvailable: () => false,
    } as NodeRuntime);
    const current = service.currentVault();

    expect(current).toMatchObject({
      id: "mybrain-leander",
      name: "Mybrain.Leander",
      kind: "personal",
      isCurrent: true,
    });
  });

  it("treats a vault that is not obviously personal as a project vault", () => {
    const service = new VaultRegistryService(appWithVault("Clarity"), { isAvailable: () => false } as NodeRuntime);
    expect(service.currentVault().kind).toBe("project");
  });

  it("discovers the vaults Obsidian itself knows about", async () => {
    const service = new VaultRegistryService(
      appWithVault("Mybrain.Leander"),
      runtimeWithVaults(["/a/Clarity", "/b/Mosaique"])
    );
    const discovered = await service.discoverVaults();

    expect(discovered.map((vault) => vault.name)).toEqual(["Clarity", "Mosaique"]);
    expect(discovered[0].origin).toBe("discovered");
  });

  it("returns nothing on mobile instead of failing", async () => {
    const service = new VaultRegistryService(appWithVault("X"), { isAvailable: () => false } as NodeRuntime);
    expect(await service.discoverVaults()).toEqual([]);
  });

  it("parses the configured registry and keeps descriptions", () => {
    const service = new VaultRegistryService(appWithVault("X"), { isAvailable: () => false } as NodeRuntime);
    const vaults = service.parseConfigured(
      JSON.stringify([
        { name: "Clarity", kind: "project", path: "/a/Clarity", description: "Social network product" },
        { name: "", path: "/ignored" },
      ])
    );

    expect(vaults).toHaveLength(1);
    expect(vaults[0]).toMatchObject({ id: "clarity", description: "Social network product", origin: "configured" });
  });

  it("falls back to discovery when the registry is not valid JSON", () => {
    const service = new VaultRegistryService(appWithVault("X"), { isAvailable: () => false } as NodeRuntime);
    expect(service.parseConfigured("{ not json")).toEqual([]);
  });

  it("merges current, discovered and configured vaults with configuration winning", async () => {
    const service = new VaultRegistryService(appWithVault("Mybrain.Leander"), runtimeWithVaults(["/a/Clarity"]));
    const vaults = await service.resolveVaults(
      JSON.stringify([{ name: "Clarity", description: "Social network product", kind: "project" }])
    );

    expect(vaults.map((vault) => vault.name).sort()).toEqual(["Clarity", "Mybrain.Leander"]);
    const clarity = vaults.find((vault) => vault.name === "Clarity")!;
    expect(clarity.description).toBe("Social network product");
    expect(clarity.path).toBe("/a/Clarity");
    expect(vaults.find((vault) => vault.isCurrent)?.name).toBe("Mybrain.Leander");
  });

  it("builds a profile from folders and index notes", async () => {
    const store = new MemoryVaultStore("clarity", "Clarity", {
      "README.md": "# Clarity\n\nA social network about identity, profiles and music.",
      "Product/Profiles.md": "notes",
      "Backend/Supabase.md": "notes",
    });
    const service = new VaultRegistryService(appWithVault("X"), { isAvailable: () => false } as NodeRuntime);

    const profile = await service.buildProfile(
      {
        id: "clarity",
        name: "Clarity",
        kind: "project",
        path: "",
        enabled: true,
        origin: "configured",
        description: "Social network",
      },
      store
    );

    expect(profile.folders.sort()).toEqual(["Backend", "Product"]);
    expect(profile.indexExcerpts[0]).toContain("social network about identity");
    expect(profile.keywords).toContain("identity");
    expect(profile.noteCount).toBe(3);
  });
});

describe("buildKeywords", () => {
  it("keeps distinctive terms and drops generic ones", () => {
    const keywords = buildKeywords(["Mosaique Sessions", "recording gear for the vault notes index"]);
    expect(keywords).toContain("mosaique");
    expect(keywords).toContain("recording");
    expect(keywords).not.toContain("vault");
    expect(keywords).not.toContain("the");
  });
});
