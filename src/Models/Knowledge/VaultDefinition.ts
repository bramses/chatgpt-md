/**
 * Vault registry model.
 *
 * Vaults are independent worlds that may live at completely unrelated
 * filesystem locations. Nothing here assumes a parent/child relationship.
 */

export type VaultKind = "personal" | "project" | "archive";

export interface VaultDefinition {
  /** Stable slug used in the manifest and in cross-vault references. */
  id: string;
  /** Vault name as Obsidian knows it (used for obsidian:// URLs). */
  name: string;
  kind: VaultKind;
  /** Absolute filesystem path. Empty for the currently open vault on mobile. */
  path: string;
  /** Optional user-written description; strongest routing signal after content. */
  description?: string;
  /** Extra routing keywords supplied by the user. */
  keywords?: string[];
  /** Folder inside the vault used when no better destination is known. */
  defaultFolder?: string;
  /** Whether the router may write into this vault. */
  enabled: boolean;
  /** True when this is the vault Obsidian currently has open. */
  isCurrent?: boolean;
  /** Where the definition came from. */
  origin: "configured" | "discovered" | "current";
}

/**
 * A lightweight semantic fingerprint of a vault, built from its folder
 * structure and index notes. Used to route units by meaning rather than by
 * a hardcoded vault list.
 */
export interface VaultProfile {
  vaultId: string;
  name: string;
  kind: VaultKind;
  description: string;
  /** Top-level and second-level folders, relative paths. */
  folders: string[];
  /** Short excerpts from HOME/README/index/MOC notes. */
  indexExcerpts: string[];
  /** Distinctive terms derived from name, folders, description and excerpts. */
  keywords: string[];
  /** Number of markdown notes seen while profiling (bounded scan). */
  noteCount: number;
}

/**
 * Obsidian wikilinks cannot cross vault boundaries, so cross-vault relations
 * are stored as structured metadata plus an obsidian:// URL.
 */
export interface CrossVaultReference {
  vault: string;
  file: string;
  conversationId?: string;
}

export function createVaultId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "vault";
}
