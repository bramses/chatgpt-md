import { VaultDefinition } from "src/Models/Knowledge/VaultDefinition";
import { KnowledgeFileStore } from "./KnowledgeFileStore";

/**
 * Keeps the plugin repository and the personal vault apart.
 *
 * A vault under version control is fine - that is what the Git plugin is for.
 * What is not fine is a personal archive quietly ending up in a repository that
 * pushes to a public remote. This service only *looks*: it never runs git, never
 * stages, never commits, never pushes, and never edits git configuration.
 */

export interface RepositoryStatus {
  isRepository: boolean;
  /** Remote URLs found in .git/config, with credentials stripped. */
  remotes?: string[];
  /** True when a remote points at a well-known public hosting service. */
  hasPublicRemote?: boolean;
  warnings: string[];
}

const PUBLIC_HOSTS = ["github.com", "gitlab.com", "bitbucket.org", "codeberg.org", "sr.ht"];

/** Strip any embedded credentials before a remote URL is shown or logged. */
export function sanitizeRemote(url: string): string {
  return url.trim().replace(/\/\/[^@/]+@/, "//");
}

export function parseGitRemotes(config: string | null): string[] {
  if (!config) return [];
  return config
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("url = "))
    .map((line) => sanitizeRemote(line.slice("url = ".length)))
    .filter((url) => url.length > 0);
}

export class RepositorySafetyService {
  async inspect(vault: VaultDefinition, store: KnowledgeFileStore): Promise<RepositoryStatus> {
    if (!(await store.exists(".git"))) return { isRepository: false, warnings: [] };

    const remotes = parseGitRemotes(await store.read(".git/config"));
    const hasPublicRemote = remotes.some((url) => PUBLIC_HOSTS.some((host) => url.includes(host)));
    const warnings: string[] = [];

    if (hasPublicRemote) {
      warnings.push(
        `"${vault.name}" is a git repository with a remote on a public hosting service ` +
          `(${remotes.join(", ")}). Personal knowledge written here could be pushed off your machine. ` +
          "This plugin never commits or pushes, but check .gitignore before you do."
      );
    } else if (remotes.length > 0) {
      warnings.push(
        `"${vault.name}" is a git repository with remote(s): ${remotes.join(", ")}. ` +
          "Nothing is committed or pushed by this plugin."
      );
    }

    return { isRepository: true, remotes, hasPublicRemote, warnings };
  }

  /**
   * Guard for the source archive specifically: the immutable conversation
   * archive is the most sensitive thing this system writes.
   */
  async checkArchiveDestination(vault: VaultDefinition, store: KnowledgeFileStore): Promise<string[]> {
    const status = await this.inspect(vault, store);
    if (!status.hasPublicRemote) return [];
    return [
      `The source archive is configured to be written into "${vault.name}", which pushes to a public remote. ` +
        "Consider a different archive vault, or make sure the archive folder is git-ignored.",
    ];
  }
}
