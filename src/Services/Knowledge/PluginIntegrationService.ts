import { VaultDefinition } from "src/Models/Knowledge/VaultDefinition";
import {
  CapabilityFlags,
  emptyCapabilityFlags,
  KnowledgeCapability,
  VaultCapabilityProfile,
} from "src/Models/Knowledge/PluginCapability";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { PluginCapabilityRegistry } from "./PluginCapabilityRegistry";
import { VaultRegistryService } from "./VaultRegistryService";
import { RepositorySafetyService, RepositoryStatus } from "./RepositorySafetyService";

/**
 * The orchestration boundary between the knowledge system and everything else
 * installed in Obsidian.
 *
 * The rule it enforces: the destination vault decides what enhancements are
 * possible. A unit routed to a vault with Dataview may get query-friendly
 * indexes; the same unit routed to a bare Markdown vault gets exactly the same
 * canonical note without them. Callers ask `has(vaultId, capability)` - never
 * "is Dataview installed?" in general, because that question has no single
 * answer across vaults.
 */

export interface VaultIntegrationStatus {
  vault: VaultDefinition;
  profile: VaultCapabilityProfile;
  repository: RepositoryStatus;
  reachable: boolean;
}

export class PluginIntegrationService {
  constructor(
    private readonly registry: VaultRegistryService,
    private readonly capabilities: PluginCapabilityRegistry = new PluginCapabilityRegistry(),
    private readonly repositories: RepositorySafetyService = new RepositorySafetyService()
  ) {}

  /**
   * Capability profile for one vault. Cached, so routing and writing can ask
   * for it per unit without touching the filesystem every time.
   */
  async getProfile(
    vault: VaultDefinition,
    store: KnowledgeFileStore,
    options: { forceRefresh?: boolean } = {}
  ): Promise<VaultCapabilityProfile> {
    return this.capabilities.getProfile(vault, store, options);
  }

  /** Flags only. Falls back to "plain Markdown" when the vault was never scanned. */
  getCapabilities(vaultId: string): CapabilityFlags {
    return this.capabilities.peek(vaultId)?.capabilities ?? emptyCapabilityFlags();
  }

  has(vaultId: string, capability: KnowledgeCapability): boolean {
    return this.getCapabilities(vaultId)[capability] === true;
  }

  peek(vaultId: string): VaultCapabilityProfile | undefined {
    return this.capabilities.peek(vaultId);
  }

  invalidate(vaultId?: string): void {
    this.capabilities.invalidate(vaultId);
  }

  /**
   * Scan every configured vault. Used by the status view and by an explicit
   * refresh - never at plugin startup.
   */
  async scanAll(registryJson: string, options: { forceRefresh?: boolean } = {}): Promise<VaultIntegrationStatus[]> {
    const vaults = await this.registry.resolveVaults(registryJson);
    const statuses: VaultIntegrationStatus[] = [];

    for (const vault of vaults) {
      const store = this.registry.storeFor(vault);
      if (!store) {
        statuses.push({
          vault,
          reachable: false,
          profile: unreachableProfile(vault),
          repository: { isRepository: false, warnings: [] },
        });
        continue;
      }

      statuses.push({
        vault,
        reachable: true,
        profile: await this.getProfile(vault, store, options),
        repository: await this.repositories.inspect(vault, store),
      });
    }

    return statuses;
  }

  /**
   * Everything worth telling the user without pretending an integration works.
   * Capabilities are reported per vault, exactly as they exist there.
   */
  renderStatus(statuses: VaultIntegrationStatus[]): string {
    const lines: string[] = [];

    statuses.forEach((status) => {
      lines.push(`### ${status.vault.name} (${status.vault.kind})`);
      lines.push("");

      if (!status.reachable) {
        lines.push("_Not reachable from this device. Knowledge is not written here._");
        lines.push("");
        return;
      }
      if (!status.profile.inspected) {
        lines.push("_Plain Markdown vault: no Obsidian configuration was readable._");
        lines.push("");
        return;
      }

      const enabled = status.profile.plugins.filter((plugin) => plugin.enabled);
      lines.push(`${enabled.length} plugin(s) enabled, ${status.profile.plugins.length} installed.`);
      lines.push("");
      lines.push("| Capability | Available | Provided by |");
      lines.push("| --- | --- | --- |");

      REPORTED_CAPABILITIES.forEach((capability) => {
        const available = status.profile.capabilities[capability];
        const providers = enabled
          .filter((plugin) => plugin.capabilities.includes(capability))
          .map((plugin) => plugin.name);
        const core = !available || providers.length > 0 ? "" : "core";
        lines.push(`| ${capability} | ${available ? "yes" : "no"} | ${providers.join(", ") || core || "-"} |`);
      });

      lines.push("");
      [...status.profile.warnings, ...status.repository.warnings].forEach((warning) => lines.push(`- ${warning}`));
      lines.push("");
    });

    return lines.join("\n");
  }
}

const REPORTED_CAPABILITIES: readonly KnowledgeCapability[] = [
  "query-engine",
  "full-text-search",
  "semantic-search",
  "tasks",
  "task-notes",
  "daily-notes",
  "calendar",
  "templates",
  "quick-capture",
  "visual-canvas",
  "drawing",
  "pdf-annotation",
  "ai-client",
  "external-api",
  "git",
  "sync",
  "icons",
];

function unreachableProfile(vault: VaultDefinition): VaultCapabilityProfile {
  return {
    vaultId: vault.id,
    vaultName: vault.name,
    vaultPath: vault.path,
    scannedAt: new Date(0).toISOString(),
    inspected: false,
    plugins: [],
    capabilities: emptyCapabilityFlags(),
    corePlugins: [],
    syncPlugins: [],
    warnings: [`"${vault.name}" is not reachable from here.`],
  };
}
