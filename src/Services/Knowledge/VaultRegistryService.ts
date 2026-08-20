import { App } from "obsidian";
import { createVaultId, VaultDefinition, VaultKind, VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { KnowledgeFileStore, NodeVaultStore, ObsidianVaultStore } from "./KnowledgeFileStore";
import { NodeRuntime } from "./NodeRuntime";
import { Logger } from "src/Utilities/Logger";
import { truncate } from "src/Utilities/KnowledgeText";

/**
 * Discovers and describes the vaults the router may write into.
 *
 * The vault list is dynamic: Obsidian's own `obsidian.json` is read where
 * available, merged with whatever the user configured, and every vault gets a
 * lightweight semantic profile (folders + index notes + description) so that
 * routing can compare meaning against the vaults that actually exist rather
 * than against a hardcoded list.
 */

const INDEX_NOTE_PATTERN = /^(home|readme|index|start|moc|map of content|dashboard|about|00)/i;
const PROFILE_FOLDER_LIMIT = 60;
const PROFILE_NOTE_SCAN_LIMIT = 4000;
const EXCERPT_LENGTH = 400;

const PERSONAL_HINTS = ["brain", "personal", "self", "life", "me", "journal", "diary"];

const KEYWORD_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "notes",
  "note",
  "vault",
  "folder",
  "obsidian",
  "untitled",
  "index",
  "home",
  "readme",
  "attachments",
  "templates",
  "archive",
  "inbox",
  "daily",
]);

export class VaultRegistryService {
  constructor(
    private readonly app: App,
    private readonly runtime: NodeRuntime = NodeRuntime.get()
  ) {}

  /** The vault Obsidian currently has open. Always available, even on mobile. */
  currentVault(): VaultDefinition {
    const name = this.app.vault.getName();
    const adapter = this.app.vault.adapter as unknown as { basePath?: string; getBasePath?: () => string };
    const path = adapter.basePath || adapter.getBasePath?.() || "";
    return {
      id: createVaultId(name),
      name,
      kind: inferKind(name),
      path,
      enabled: true,
      isCurrent: true,
      origin: "current",
    };
  }

  /** Read Obsidian's own vault list. Desktop only; returns [] elsewhere. */
  async discoverVaults(): Promise<VaultDefinition[]> {
    if (!this.runtime.isAvailable()) return [];

    for (const candidate of this.runtime.obsidianConfigCandidates()) {
      try {
        const raw = await this.runtime.fs!.promises.readFile(candidate, "utf8");
        const parsed = JSON.parse(raw) as { vaults?: Record<string, { path?: string }> };
        const entries = Object.values(parsed.vaults || {});
        if (entries.length === 0) continue;

        return entries
          .map((entry) => entry.path)
          .filter((path): path is string => typeof path === "string" && path.length > 0)
          .map((path) => {
            const name = this.runtime.path!.basename(path);
            return {
              id: createVaultId(name),
              name,
              kind: inferKind(name),
              path,
              enabled: true,
              origin: "discovered" as const,
            };
          });
      } catch (error) {
        Logger.debug("[ChatGPT MD] Vault discovery candidate unavailable", {
          candidate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return [];
  }

  /** Parse the user-managed registry stored in settings. Never throws. */
  parseConfigured(json: string): VaultDefinition[] {
    if (!json || !json.trim()) return [];
    try {
      const parsed = JSON.parse(json) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { vaults?: unknown }).vaults)
          ? (parsed as { vaults: unknown[] }).vaults
          : [];
      return list
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry): VaultDefinition | null => {
          const name = String(entry.name || entry.id || "").trim();
          if (!name) return null;
          return {
            id: String(entry.id || createVaultId(name)),
            name,
            kind: (["personal", "project", "archive"].includes(String(entry.kind))
              ? entry.kind
              : inferKind(name)) as VaultKind,
            path: typeof entry.path === "string" ? entry.path : "",
            description: typeof entry.description === "string" ? entry.description : undefined,
            keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String) : undefined,
            defaultFolder: typeof entry.defaultFolder === "string" ? entry.defaultFolder : undefined,
            enabled: entry.enabled !== false,
            origin: "configured" as const,
          };
        })
        .filter((entry): entry is VaultDefinition => entry !== null);
    } catch (error) {
      Logger.error("[ChatGPT MD] Vault registry is not valid JSON; falling back to discovery", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Merge current vault, discovered vaults and configured vaults.
   * Configured entries win: they carry the descriptions that make routing good.
   */
  async resolveVaults(registryJson: string): Promise<VaultDefinition[]> {
    const merged = new Map<string, VaultDefinition>();
    const add = (vault: VaultDefinition): void => {
      const key = vault.id;
      const existing = merged.get(key);
      merged.set(
        key,
        existing
          ? { ...existing, ...stripEmpty(vault), origin: existing.origin === "current" ? "current" : vault.origin }
          : vault
      );
    };

    add(this.currentVault());
    (await this.discoverVaults()).forEach(add);
    this.parseConfigured(registryJson).forEach(add);

    return [...merged.values()];
  }

  storeFor(vault: VaultDefinition): KnowledgeFileStore | null {
    if (vault.isCurrent) {
      return new ObsidianVaultStore(vault.id, vault.name, this.app.vault.adapter);
    }
    if (!vault.path || !this.runtime.isAvailable()) return null;
    return new NodeVaultStore(vault.id, vault.name, vault.path, this.runtime);
  }

  /** Build the semantic fingerprint used for meaning-based routing. */
  async buildProfile(vault: VaultDefinition, store: KnowledgeFileStore): Promise<VaultProfile> {
    const folders = await this.readFolders(store);
    const { excerpts, noteCount } = await this.readIndexNotes(store, folders);

    const keywords = buildKeywords([
      vault.name,
      vault.description || "",
      ...(vault.keywords || []),
      ...folders,
      ...excerpts,
    ]);

    return {
      vaultId: vault.id,
      name: vault.name,
      kind: vault.kind,
      description: vault.description || "",
      folders,
      indexExcerpts: excerpts,
      keywords,
      noteCount,
    };
  }

  private async readFolders(store: KnowledgeFileStore): Promise<string[]> {
    const top = (await store.listFolders("")).filter((folder) => !folder.startsWith("."));
    const folders: string[] = [...top];
    for (const folder of top.slice(0, 20)) {
      const children = await store.listFolders(folder);
      folders.push(...children.slice(0, 12));
      if (folders.length >= PROFILE_FOLDER_LIMIT) break;
    }
    return folders.slice(0, PROFILE_FOLDER_LIMIT);
  }

  private async readIndexNotes(
    store: KnowledgeFileStore,
    folders: string[]
  ): Promise<{ excerpts: string[]; noteCount: number }> {
    const rootNotes = await store.listFiles("", { extension: ".md", limit: 200 });
    const candidates = rootNotes.filter((path) => INDEX_NOTE_PATTERN.test(baseName(path)));
    for (const folder of folders) {
      if (candidates.length >= 8) break;
      if (!INDEX_NOTE_PATTERN.test(baseName(folder))) continue;
      const inside = await store.listFiles(folder, { extension: ".md", limit: 10 });
      candidates.push(...inside);
    }

    const excerpts: string[] = [];
    for (const path of candidates.slice(0, 8)) {
      const content = await store.read(path);
      if (!content) continue;
      excerpts.push(truncate(stripMarkdown(content), EXCERPT_LENGTH));
    }

    const allNotes = await store.listFiles("", { extension: ".md", recursive: true, limit: PROFILE_NOTE_SCAN_LIMIT });
    return { excerpts, noteCount: allNotes.length };
  }
}

function baseName(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1].replace(/\.md$/i, "");
}

function stripMarkdown(content: string): string {
  return content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/[#>*_\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferKind(name: string): VaultKind {
  const lower = name.toLowerCase();
  return PERSONAL_HINTS.some((hint) => lower.includes(hint)) ? "personal" : "project";
}

function stripEmpty(vault: VaultDefinition): Partial<VaultDefinition> {
  return Object.fromEntries(
    Object.entries(vault).filter(([, value]) => value !== undefined && value !== "" && value !== null)
  ) as Partial<VaultDefinition>;
}

/** Distinctive lowercase terms used as routing signals. */
export function buildKeywords(sources: string[]): string[] {
  const counts = new Map<string, number>();
  sources
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !KEYWORD_STOP_WORDS.has(token) && !/^\d+$/.test(token))
    .forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 60)
    .map(([token]) => token);
}
