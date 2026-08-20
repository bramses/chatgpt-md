import { VaultDefinition } from "src/Models/Knowledge/VaultDefinition";
import { MemoryVaultStore } from "./KnowledgeFileStore";
import {
  buildCapabilityFlags,
  diffCapabilities,
  PluginCapabilityRegistry,
  readCorePlugins,
  readEnabledCommunityPlugins,
} from "./PluginCapabilityRegistry";

/**
 * Plugins are per vault. These tests pin that down: the same plugin can be
 * enabled here, installed-but-off there, and absent somewhere else, and the
 * capability profile must reflect each vault as it actually is.
 */

function vault(id: string, name: string, kind: VaultDefinition["kind"] = "personal"): VaultDefinition {
  return { id, name, kind, path: `/vaults/${name}`, enabled: true, origin: "configured" };
}

/** Build a store that looks like a real `.obsidian` directory. */
function vaultStore(options: {
  enabled?: string[];
  installed?: string[];
  core?: Record<string, boolean> | string[];
  manifests?: Record<string, unknown>;
  raw?: Record<string, string>;
}): MemoryVaultStore {
  const files: Record<string, string> = {};
  if (options.enabled) files[".obsidian/community-plugins.json"] = JSON.stringify(options.enabled);
  if (options.core) files[".obsidian/core-plugins.json"] = JSON.stringify(options.core);
  (options.installed || []).forEach((pluginId) => {
    const manifest = options.manifests?.[pluginId] ?? { id: pluginId, name: pluginId, version: "1.0.0" };
    files[`.obsidian/plugins/${pluginId}/manifest.json`] = JSON.stringify(manifest);
  });
  Object.assign(files, options.raw || {});
  return new MemoryVaultStore("v", "V", files);
}

describe("reading Obsidian's own plugin configuration", () => {
  it("accepts core-plugins.json as an object or as an array", () => {
    expect(readCorePlugins(JSON.stringify({ canvas: true, "daily-notes": false }))).toEqual(["canvas"]);
    expect(readCorePlugins(JSON.stringify(["canvas", "backlink"]))).toEqual(["canvas", "backlink"]);
  });

  it("survives malformed or missing configuration", () => {
    expect(readCorePlugins("{not json")).toEqual([]);
    expect(readCorePlugins(null)).toEqual([]);
    expect(readEnabledCommunityPlugins("{}")).toEqual([]);
    expect(readEnabledCommunityPlugins(null)).toEqual([]);
  });
});

describe("PluginCapabilityRegistry per-vault scanning", () => {
  const registry = new PluginCapabilityRegistry(() => 1_000_000);

  it("reports a plugin that is installed and enabled", async () => {
    const store = vaultStore({
      enabled: ["dataview"],
      installed: ["dataview"],
      manifests: { dataview: { name: "Dataview", version: "0.5.0" } },
    });

    const profile = await registry.scan(vault("mybrain", "Mybrain"), store);
    const dataview = profile.plugins.find((plugin) => plugin.pluginId === "dataview")!;

    expect(dataview).toMatchObject({ installed: true, enabled: true, name: "Dataview", version: "0.5.0" });
    expect(profile.capabilities["query-engine"]).toBe(true);
  });

  it("does not claim a capability for a plugin that is installed but disabled", async () => {
    const store = vaultStore({ enabled: [], installed: ["dataview", "quickadd"] });
    const profile = await registry.scan(vault("clarity", "Clarity", "project"), store);

    expect(profile.plugins.every((plugin) => plugin.installed && !plugin.enabled)).toBe(true);
    expect(profile.capabilities["query-engine"]).toBe(false);
    expect(profile.capabilities["quick-capture"]).toBe(false);
    expect(profile.warnings.join(" ")).toContain("installed but disabled");
  });

  it("ignores a plugin that is listed as enabled but missing from disk", async () => {
    const store = vaultStore({ enabled: ["dataview"], installed: [] });
    const profile = await registry.scan(vault("broken", "Broken"), store);

    expect(profile.plugins[0]).toMatchObject({ pluginId: "dataview", installed: false, enabled: false });
    expect(profile.capabilities["query-engine"]).toBe(false);
  });

  it("treats a vault without .obsidian as plain Markdown", async () => {
    const profile = await registry.scan(vault("bare", "Bare"), new MemoryVaultStore("v", "V", { "note.md": "# hi" }));

    expect(profile.inspected).toBe(false);
    expect(profile.plugins).toEqual([]);
    expect(Object.values(profile.capabilities).every((value) => value === false)).toBe(true);
    expect(profile.warnings[0]).toContain("plain Markdown vault");
  });

  it("keeps going when a manifest is malformed", async () => {
    const store = vaultStore({
      enabled: ["dataview"],
      installed: ["dataview"],
      raw: { ".obsidian/plugins/dataview/manifest.json": "{ broken" },
    });

    const profile = await registry.scan(vault("v", "V"), store);
    expect(profile.plugins[0]).toMatchObject({ pluginId: "dataview", enabled: true, name: "Dataview" });
    expect(profile.capabilities["query-engine"]).toBe(true);
  });

  it("records an unknown future plugin without attempting to integrate", async () => {
    const store = vaultStore({ enabled: ["some-plugin-from-2029"], installed: ["some-plugin-from-2029"] });
    const profile = await registry.scan(vault("v", "V"), store);

    const unknown = profile.plugins[0];
    expect(unknown).toMatchObject({ enabled: true, safeToUse: false, capabilities: [], integrationMode: "optional" });
    expect(Object.values(profile.capabilities).every((value) => value === false)).toBe(true);
    expect(profile.warnings.join(" ")).toContain("does not know");
  });

  it("derives capabilities from enabled core plugins too", async () => {
    const store = vaultStore({
      enabled: [],
      installed: [],
      core: { canvas: true, "daily-notes": true, templates: false },
    });
    const profile = await registry.scan(vault("v", "V"), store);

    expect(profile.capabilities["visual-canvas"]).toBe(true);
    expect(profile.capabilities["daily-notes"]).toBe(true);
    expect(profile.capabilities.templates).toBe(false);
  });

  it("warns when several bidirectional sync plugins are enabled at once", async () => {
    const store = vaultStore({
      enabled: ["obsidian-livesync", "remotely-save"],
      installed: ["obsidian-livesync", "remotely-save"],
    });

    const profile = await registry.scan(vault("mybrain", "Mybrain"), store);
    expect(profile.syncPlugins).toEqual(["obsidian-livesync", "remotely-save"]);
    expect(profile.warnings.join(" ")).toContain("bidirectional sync plugins enabled");
    expect(profile.warnings.join(" ")).toContain("Nothing was changed");
  });

  it("gives different vaults different profiles from the same registry", async () => {
    const rich = vaultStore({
      enabled: ["dataview", "obsidian-tasks-plugin", "quickadd", "smart-connections"],
      installed: ["dataview", "obsidian-tasks-plugin", "quickadd", "smart-connections"],
    });
    const bare = vaultStore({ enabled: [], installed: [] });

    const personal = await registry.getProfile(vault("mybrain", "Mybrain"), rich);
    const project = await registry.getProfile(vault("jelena", "Jelena", "project"), bare);

    expect(personal.capabilities["query-engine"]).toBe(true);
    expect(personal.capabilities.tasks).toBe(true);
    expect(project.capabilities["query-engine"]).toBe(false);
    expect(project.capabilities.tasks).toBe(false);
    expect(registry.peek("mybrain")?.capabilities["semantic-search"]).toBe(true);
    expect(registry.peek("jelena")?.capabilities["semantic-search"]).toBe(false);
  });
});

describe("capability caching keeps writing cheap", () => {
  it("scans once and serves the cached profile afterwards", async () => {
    let clock = 0;
    const registry = new PluginCapabilityRegistry(() => clock);
    const store = vaultStore({ enabled: ["dataview"], installed: ["dataview"] });
    let reads = 0;
    const counting = new Proxy(store, {
      get(target, property, receiver) {
        if (property === "read") {
          return async (path: string) => {
            reads++;
            return target.read(path);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as MemoryVaultStore;

    await registry.getProfile(vault("v", "V"), counting);
    const afterFirst = reads;
    await registry.getProfile(vault("v", "V"), counting);
    await registry.getProfile(vault("v", "V"), counting);

    expect(reads).toBe(afterFirst);

    // Stale cache and an explicit refresh both rescan.
    clock += 60 * 60 * 1000;
    await registry.getProfile(vault("v", "V"), counting);
    expect(reads).toBeGreaterThan(afterFirst);
  });

  it("picks up a plugin enabled after the first scan, on refresh", async () => {
    const registry = new PluginCapabilityRegistry(() => 0);
    const before = vaultStore({ enabled: [], installed: ["dataview"] });
    const first = await registry.getProfile(vault("new", "NewProject", "project"), before);
    expect(first.capabilities["query-engine"]).toBe(false);

    const after = vaultStore({ enabled: ["dataview"], installed: ["dataview"] });
    const second = await registry.getProfile(vault("new", "NewProject", "project"), after, { forceRefresh: true });

    expect(second.capabilities["query-engine"]).toBe(true);
    expect(diffCapabilities(first.capabilities, second.capabilities)).toEqual([
      { capability: "query-engine", from: false, to: true },
    ]);
  });
});

describe("buildCapabilityFlags", () => {
  it("only counts enabled, known plugins", () => {
    const flags = buildCapabilityFlags(
      [
        {
          pluginId: "dataview",
          name: "Dataview",
          installed: true,
          enabled: true,
          capabilities: ["query-engine"],
          integrationMode: "markdown-compatible",
          safeToUse: true,
        },
        {
          pluginId: "quickadd",
          name: "QuickAdd",
          installed: true,
          enabled: false,
          capabilities: ["quick-capture"],
          integrationMode: "command",
          safeToUse: true,
        },
        {
          pluginId: "mystery",
          name: "Mystery",
          installed: true,
          enabled: true,
          capabilities: ["tasks"],
          integrationMode: "optional",
          safeToUse: false,
        },
      ],
      []
    );

    expect(flags["query-engine"]).toBe(true);
    expect(flags["quick-capture"]).toBe(false);
    expect(flags.tasks).toBe(false);
  });
});
