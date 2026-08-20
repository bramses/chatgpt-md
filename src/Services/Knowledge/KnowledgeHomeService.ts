import { CapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { ConceptRecord } from "src/Models/Knowledge/KnowledgeImportManifest";
import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { PERSONAL_FOLDERS } from "./PersonalOntology";
import { VaultEnhancementService } from "./VaultEnhancementService";
import { VaultIntegrationStatus } from "./PluginIntegrationService";
import { isSuppressedLifecycle, renderBlindSpots } from "src/Models/Knowledge/Epistemics";
import { joinPath, upsertFrontmatterFields, upsertManagedBlock } from "src/Utilities/KnowledgeText";

/**
 * Entry points into the knowledge system.
 *
 * These are the notes a person - or an AI client like Claudian or Copilot -
 * opens first. They are generated inside managed blocks so they can be rebuilt
 * without touching anything written by hand, and they adapt to the destination
 * vault: live Dataview queries where Dataview exists, the equivalent generated
 * lists where it does not.
 *
 * The vault is the memory. No AI plugin needs its own.
 */

export const HOME_NOTE = joinPath(PERSONAL_FOLDERS.home, "Knowledge Home.md");
export const STATUS_NOTE = joinPath(PERSONAL_FOLDERS.system, "Knowledge System Status.md");

const BLOCK_OVERVIEW = "home-overview";
const BLOCK_STATUS = "system-status";

interface AreaSection {
  heading: string;
  /** Folder prefix used both for the Dataview query and the generated list. */
  folder: string;
  type?: string;
  limit: number;
}

const AREAS: AreaSection[] = [
  { heading: "Patterns", folder: PERSONAL_FOLDERS.patterns, limit: 25 },
  { heading: "Current questions", folder: PERSONAL_FOLDERS.questions, limit: 15 },
  { heading: "Dreams", folder: "04 Dreams", type: "dream", limit: 15 },
  { heading: "People", folder: PERSONAL_FOLDERS.people, type: "person", limit: 20 },
  { heading: "Music", folder: PERSONAL_FOLDERS.music, limit: 15 },
  { heading: "Books and films", folder: PERSONAL_FOLDERS.library, type: "media", limit: 20 },
  { heading: "Experiences", folder: "13 Experiences", limit: 15 },
  { heading: "Horizon", folder: PERSONAL_FOLDERS.horizon, limit: 15 },
];

export class KnowledgeHomeService {
  constructor(
    private readonly manifest: ImportManifestService,
    private readonly enhancements: VaultEnhancementService = new VaultEnhancementService(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  /** One entry note, adapted to what the vault can render. */
  async writeHome(store: KnowledgeFileStore, capabilities: CapabilityFlags): Promise<string> {
    const concepts = this.manifest
      .listConcepts()
      .filter((concept) => concept.vaultId === store.vaultId)
      .filter((concept) => !isSuppressedLifecycle(concept.lifecycle) && concept.surfaceInRetrieval !== false);

    const sections = AREAS.map((area) => this.renderArea(area, concepts, capabilities));
    const recentlyChanged = concepts
      .slice()
      .sort((a, b) => (b.lastObserved || "").localeCompare(a.lastObserved || ""))
      .slice(0, 12)
      .map((concept) => `- ${link(concept)} (${concept.lastObserved || "undated"})`)
      .join("\n");

    const overview = [
      "_An observatory over written traces. Not a description of a person._",
      "",
      "## Start here",
      "",
      "- [[The Good Life]] - yours to write",
      "- [[Current Chapter]] - yours to write",
      "- [[Concept Index]]",
      "- [[Dream Atlas]]",
      "- [[Open Horizon]]",
      "- [[Review Queue]]",
      "- [[Model Review]]",
      "- [[Knowledge System Status]]",
      "",
      "## Recently changed",
      "",
      recentlyChanged || "_Nothing yet._",
      "",
      ...sections,
      renderBlindSpots(),
    ].join("\n");

    const existing =
      (await store.read(HOME_NOTE)) ??
      ["# Knowledge Home", "", "## Mine", "", "_Anything you write here is yours and is never touched._", "", ""].join(
        "\n"
      );

    let content = upsertManagedBlock(existing, BLOCK_OVERVIEW, "## Overview", overview);
    content = upsertFrontmatterFields(content, {
      type: "moc",
      generated_by: "chatgpt-md",
      updated: this.clock().toISOString().slice(0, 10),
      ...(capabilities.icons ? { icon: "LiCompass" } : {}),
    });

    await store.write(HOME_NOTE, content);
    return HOME_NOTE;
  }

  /**
   * One area of the home note: a live query where the vault has a query engine,
   * and the generated list either way, so nothing is lost if Dataview goes.
   */
  private renderArea(area: AreaSection, concepts: ConceptRecord[], capabilities: CapabilityFlags): string {
    const matching = concepts
      .filter((concept) => concept.path.startsWith(area.folder))
      .sort((a, b) => (b.lastObserved || "").localeCompare(a.lastObserved || ""))
      .slice(0, area.limit);

    const fallback =
      matching.length > 0 ? matching.map((concept) => `- ${link(concept)}`).join("\n") : "_Nothing here yet._";

    const body = this.enhancements.renderQuerySection(
      capabilities,
      { from: `"${area.folder}"`, where: area.type ? `type = "${area.type}"` : undefined },
      fallback
    );

    return [`## ${area.heading}`, "", body, ""].join("\n");
  }

  /**
   * Per-vault capability status. Deliberately blunt: a capability is only
   * reported as available when it was actually observed in that vault.
   */
  async writeStatus(
    store: KnowledgeFileStore,
    statuses: VaultIntegrationStatus[],
    importSummary: string[]
  ): Promise<string> {
    const existing =
      (await store.read(STATUS_NOTE)) ??
      ["# Knowledge System Status", "", "Generated. Nothing here is configuration.", "", ""].join("\n");

    const body = [
      "## Importer",
      "",
      ...importSummary.map((line) => `- ${line}`),
      "",
      "## Vaults and their capabilities",
      "",
      "_Plugins are per vault. A capability is listed only where it was actually found._",
      "",
      ...statuses.map((status) => this.renderVault(status)),
    ].join("\n");

    let content = upsertManagedBlock(existing, BLOCK_STATUS, "## Status", body);
    content = upsertFrontmatterFields(content, {
      type: "chatgpt-system-status",
      generated_by: "chatgpt-md",
      updated: this.clock().toISOString().slice(0, 10),
      vaults: statuses.length,
    });

    await store.write(STATUS_NOTE, content);
    return STATUS_NOTE;
  }

  private renderVault(status: VaultIntegrationStatus): string {
    const lines = [`### ${status.vault.name}`, ""];

    if (!status.reachable) {
      lines.push("_Not reachable from this device._", "");
      return lines.join("\n");
    }
    if (!status.profile.inspected) {
      lines.push("_Plain Markdown vault. Knowledge here uses no plugin features._", "");
      return lines.join("\n");
    }

    const enabled = status.profile.plugins.filter((plugin) => plugin.enabled);
    const capabilities = Object.entries(status.profile.capabilities)
      .filter(([, available]) => available)
      .map(([capability]) => capability);

    lines.push(`- plugins enabled: ${enabled.length} of ${status.profile.plugins.length} installed`);
    lines.push(`- capabilities: ${capabilities.length > 0 ? capabilities.join(", ") : "plain Markdown only"}`);
    if (status.repository.isRepository) {
      lines.push(`- git repository: yes${status.repository.hasPublicRemote ? " (public remote)" : ""}`);
    }
    [...status.profile.warnings, ...status.repository.warnings].forEach((warning) =>
      lines.push(`- warning: ${warning}`)
    );
    lines.push("");
    return lines.join("\n");
  }

  /**
   * Context notes for a project vault, so an AI client opening it has somewhere
   * to start. Created only when missing: an existing note is never rewritten.
   */
  async ensureProjectContext(store: KnowledgeFileStore, vaultName: string): Promise<string[]> {
    const written: string[] = [];
    const notes: Array<{ path: string; body: string[] }> = [
      {
        path: "HOME.md",
        body: [
          `# ${vaultName}`,
          "",
          "Entry point for this vault.",
          "",
          "- [[PROJECT CONTEXT]]",
          "- [[CURRENT STATE]]",
          "- [[DECISIONS]]",
          "",
        ],
      },
      {
        path: "PROJECT CONTEXT.md",
        body: [`# ${vaultName} - context`, "", "What this project is, who it is for, and what it is not.", "", ""],
      },
      {
        path: "CURRENT STATE.md",
        body: [`# ${vaultName} - current state`, "", "Where things stand right now.", "", ""],
      },
      {
        path: "DECISIONS.md",
        body: [
          `# ${vaultName} - decisions`,
          "",
          "Decisions and their reasons. Knowledge routed here from conversations lands under the project's own folders.",
          "",
          "",
        ],
      },
    ];

    for (const note of notes) {
      if (await store.exists(note.path)) continue;
      await store.write(
        note.path,
        upsertFrontmatterFields(note.body.join("\n"), { type: "project-context", generated_by: "chatgpt-md" })
      );
      written.push(note.path);
    }

    return written;
  }
}

function link(concept: ConceptRecord): string {
  return `[[${concept.path.replace(/\.md$/i, "")}|${concept.title}]]`;
}
