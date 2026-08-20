import { KnowledgeStatus } from "src/Models/Knowledge/KnowledgeImportManifest";
import { CaptureKind } from "./CaptureService";

/**
 * The knowledge system's external control surface.
 *
 * Local REST API, MCP servers, companion apps and other plugins get a small,
 * explicit set of operations instead of raw access to the vault. Three rules
 * hold regardless of the caller:
 *
 * - This plugin opens no ports. It exposes an in-process object; whatever the
 *   user has configured for network access is what carries it, under that
 *   plugin's own permissions.
 * - Writes are refused unless the user turned the write surface on.
 * - Settings, credentials, provider keys and manifest internals are never
 *   returned by any operation here.
 */

export interface KnowledgeApiVault {
  id: string;
  name: string;
  kind: string;
  reachable: boolean;
  capabilities: string[];
}

export interface KnowledgeApiNote {
  path: string;
  title: string;
  vaultId: string;
  excerpt: string;
}

export interface KnowledgeApiRoutingPreview {
  vault: string;
  folder: string;
  confidence: number;
  status: string;
  reason: string;
}

/**
 * Implemented by the plugin and handed to external callers.
 * Deliberately small: everything here is something an agent legitimately needs
 * and nothing here can leak configuration.
 */
export interface KnowledgeApi {
  readonly version: number;
  /** Whether write operations are permitted at all. */
  canWrite(): boolean;
  status(): Promise<KnowledgeStatus>;
  vaults(): Promise<KnowledgeApiVault[]>;
  search(query: string, options?: { limit?: number; vaultId?: string }): Promise<KnowledgeApiNote[]>;
  read(path: string, options?: { vaultId?: string }): Promise<string | null>;
  capture(kind: CaptureKind, title: string, body?: string): Promise<{ path: string } | null>;
  previewRouting(text: string): Promise<KnowledgeApiRoutingPreview[]>;
}

export const KNOWLEDGE_API_VERSION = 1;

export class KnowledgeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeApiError";
  }
}

/** Paths an external caller may never read, whatever it asks for. */
const FORBIDDEN_PATTERNS = [/(^|\/)\.obsidian(\/|$)/i, /(^|\/)\.git(\/|$)/i, /\.json$/i, /(^|\/)\.\./];

/**
 * Guard for caller-supplied paths: no traversal, no configuration, no plugin
 * data. Markdown and canvases only.
 */
export function assertReadablePath(path: string): void {
  const normalized = (path || "").replace(/\\/g, "/").trim();
  if (!normalized) throw new KnowledgeApiError("A path is required.");
  if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new KnowledgeApiError("That path is not available through the knowledge API.");
  }
  if (!/\.(md|canvas)$/i.test(normalized)) {
    throw new KnowledgeApiError("Only Markdown and canvas files can be read through the knowledge API.");
  }
}

export function excerptOf(content: string, query: string, length = 240): string {
  const body = content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const needle = query.trim().split(/\s+/)[0]?.toLowerCase();
  const index = needle ? body.toLowerCase().indexOf(needle) : -1;
  const start = index > 80 ? index - 80 : 0;
  return body.slice(start, start + length).trim();
}
