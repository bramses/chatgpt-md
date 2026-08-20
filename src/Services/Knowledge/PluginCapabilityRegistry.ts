import { VaultDefinition } from "src/Models/Knowledge/VaultDefinition";
import {
  CapabilityFlags,
  CORE_CAPABILITY_MAP,
  describePlugin,
  emptyCapabilityFlags,
  KnowledgeCapability,
  PluginCapability,
  VaultCapabilityProfile,
} from "src/Models/Knowledge/PluginCapability";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { Logger } from "src/Utilities/Logger";

/**
 * Discovers, per vault, which plugins exist and which are actually enabled.
 *
 * Plugins in Obsidian are vault-local. The same plugin can be enabled in one
 * vault, installed but switched off in the next, and missing from a third, so a
 * single global capability list would be wrong in every direction. Profiles are
 * built per vault, cached, and only refreshed on demand - discovery must never
 * cost anything during normal note writing.
 *
 * This registry is strictly read-only: it never installs, enables, disables or
 * copies plugin configuration, and it never reads plugin settings files (which
 * routinely contain tokens and credentials).
 */

const OBSIDIAN_DIR = ".obsidian";
/** Profiles older than this are re-scanned on the next request. */
export const PROFILE_TTL_MS = 10 * 60 * 1000;
/** Bounded: a vault with hundreds of plugin folders should not stall a run. */
const MAX_PLUGIN_FOLDERS = 200;

interface CachedProfile {
  profile: VaultCapabilityProfile;
  scannedAtMs: number;
}

function parseJson<T>(raw: string | null, context: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    Logger.debug("[ChatGPT MD] Unreadable plugin configuration", {
      context,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * `core-plugins.json` has been both an array of ids and an object of
 * id -> boolean across Obsidian versions. Accept either.
 */
export function readCorePlugins(raw: string | null): string[] {
  const parsed = parseJson<unknown>(raw, "core-plugins.json");
  if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>)
      .filter(([, enabled]) => enabled === true)
      .map(([id]) => id);
  }
  return [];
}

export function readEnabledCommunityPlugins(raw: string | null): string[] {
  const parsed = parseJson<unknown>(raw, "community-plugins.json");
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
}

export class PluginCapabilityRegistry {
  private readonly cache = new Map<string, CachedProfile>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Cached profile, scanning only when missing or stale. */
  async getProfile(
    vault: VaultDefinition,
    store: KnowledgeFileStore,
    options: { forceRefresh?: boolean } = {}
  ): Promise<VaultCapabilityProfile> {
    const cached = this.cache.get(vault.id);
    if (!options.forceRefresh && cached && this.now() - cached.scannedAtMs < PROFILE_TTL_MS) {
      return cached.profile;
    }

    const profile = await this.scan(vault, store);
    this.cache.set(vault.id, { profile, scannedAtMs: this.now() });
    return profile;
  }

  peek(vaultId: string): VaultCapabilityProfile | undefined {
    return this.cache.get(vaultId)?.profile;
  }

  invalidate(vaultId?: string): void {
    if (vaultId) this.cache.delete(vaultId);
    else this.cache.clear();
  }

  /** One bounded pass over `.obsidian`. No plugin settings are read. */
  async scan(vault: VaultDefinition, store: KnowledgeFileStore): Promise<VaultCapabilityProfile> {
    const scannedAt = new Date(this.now()).toISOString();
    const base: VaultCapabilityProfile = {
      vaultId: vault.id,
      vaultName: vault.name,
      vaultPath: vault.path,
      scannedAt,
      inspected: false,
      plugins: [],
      capabilities: emptyCapabilityFlags(),
      corePlugins: [],
      syncPlugins: [],
      warnings: [],
    };

    if (!(await store.exists(OBSIDIAN_DIR))) {
      base.warnings.push(`No .obsidian directory found for "${vault.name}". Treating it as a plain Markdown vault.`);
      return base;
    }

    const enabled = new Set(readEnabledCommunityPlugins(await store.read(`${OBSIDIAN_DIR}/community-plugins.json`)));
    const corePlugins = readCorePlugins(await store.read(`${OBSIDIAN_DIR}/core-plugins.json`));
    const installed = await this.listInstalledPlugins(store);

    const plugins = await this.describePlugins(store, installed, enabled);
    const capabilities = buildCapabilityFlags(plugins, corePlugins);
    const syncPlugins = plugins
      .filter((plugin) => plugin.enabled && plugin.capabilities.includes("sync"))
      .map((plugin) => plugin.pluginId);

    return {
      ...base,
      inspected: true,
      plugins,
      capabilities,
      corePlugins,
      syncPlugins,
      warnings: buildWarnings(vault, plugins, syncPlugins),
    };
  }

  private async listInstalledPlugins(store: KnowledgeFileStore): Promise<string[]> {
    const folders = await store.listFolders(`${OBSIDIAN_DIR}/plugins`);
    return folders
      .map((folder) => folder.split("/").pop() || "")
      .filter((id) => id.length > 0)
      .slice(0, MAX_PLUGIN_FOLDERS);
  }

  private async describePlugins(
    store: KnowledgeFileStore,
    installed: string[],
    enabled: Set<string>
  ): Promise<PluginCapability[]> {
    const ids = [...new Set([...installed, ...enabled])].sort();
    const plugins: PluginCapability[] = [];

    for (const pluginId of ids) {
      const known = describePlugin(pluginId);
      const manifest = parseJson<{ name?: string; version?: string }>(
        await store.read(`${OBSIDIAN_DIR}/plugins/${pluginId}/manifest.json`),
        `${pluginId}/manifest.json`
      );

      plugins.push({
        pluginId,
        name: manifest?.name || known.name,
        installed: installed.includes(pluginId),
        // Enabled in the list but missing on disk means a broken install, not a capability.
        enabled: enabled.has(pluginId) && installed.includes(pluginId),
        version: manifest?.version,
        capabilities: known.capabilities,
        integrationMode: known.integrationMode,
        safeToUse: known.safeToUse !== false,
        notes: known.notes,
      });
    }

    return plugins;
  }
}

export function buildCapabilityFlags(plugins: PluginCapability[], corePlugins: string[]): CapabilityFlags {
  const flags = emptyCapabilityFlags();

  plugins
    .filter((plugin) => plugin.enabled && plugin.safeToUse)
    .forEach((plugin) => plugin.capabilities.forEach((capability) => (flags[capability] = true)));

  corePlugins.forEach((coreId) => {
    const capability = CORE_CAPABILITY_MAP[coreId];
    if (capability) flags[capability] = true;
  });

  return flags;
}

function buildWarnings(vault: VaultDefinition, plugins: PluginCapability[], syncPlugins: string[]): string[] {
  const warnings: string[] = [];

  if (syncPlugins.length > 1) {
    const names = plugins
      .filter((plugin) => syncPlugins.includes(plugin.pluginId))
      .map((plugin) => plugin.name)
      .join(" and ");
    warnings.push(
      `"${vault.name}" has ${syncPlugins.length} bidirectional sync plugins enabled (${names}). ` +
        "Running several at once can produce conflicts or duplicated files. Nothing was changed."
    );
  }

  const disabledButUseful = plugins.filter(
    (plugin) => plugin.installed && !plugin.enabled && plugin.capabilities.length > 0
  );
  if (disabledButUseful.length > 0) {
    warnings.push(
      `"${vault.name}" has ${disabledButUseful.length} capability plugin(s) installed but disabled ` +
        `(${disabledButUseful.map((plugin) => plugin.name).join(", ")}). ` +
        "Knowledge is written as plain Markdown here; enable them yourself if you want the extras."
    );
  }

  const unknown = plugins.filter((plugin) => plugin.enabled && !plugin.safeToUse);
  if (unknown.length > 0) {
    warnings.push(
      `"${vault.name}" has ${unknown.length} plugin(s) this system does not know ` +
        `(${unknown.map((plugin) => plugin.name).join(", ")}). No integration is attempted with them.`
    );
  }

  return warnings;
}

/** Capabilities that changed between two scans, for refresh reporting. */
export function diffCapabilities(
  before: CapabilityFlags | undefined,
  after: CapabilityFlags
): Array<{ capability: KnowledgeCapability; from: boolean; to: boolean }> {
  if (!before) return [];
  return (Object.keys(after) as KnowledgeCapability[])
    .filter((capability) => before[capability] !== after[capability])
    .map((capability) => ({ capability, from: before[capability], to: after[capability] }));
}
