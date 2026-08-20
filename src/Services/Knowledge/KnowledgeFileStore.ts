import { DataAdapter, normalizePath } from "obsidian";
import { NodeRuntime } from "./NodeRuntime";
import { joinPath } from "src/Utilities/KnowledgeText";

/**
 * One uniform, path-based file API for every destination the importer writes to.
 *
 * Three implementations:
 * - `ObsidianVaultStore` for the vault Obsidian currently has open.
 * - `NodeVaultStore` for any other vault on disk (desktop only).
 * - `MemoryVaultStore` for dry runs and tests - nothing touches the disk.
 */

export interface FileStat {
  size: number;
  mtime: number;
}

export interface KnowledgeFileStore {
  readonly vaultId: string;
  readonly vaultName: string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  listFiles(folder: string, options?: { recursive?: boolean; extension?: string; limit?: number }): Promise<string[]>;
  listFolders(folder: string): Promise<string[]>;
  stat(path: string): Promise<FileStat | null>;
}

export class ObsidianVaultStore implements KnowledgeFileStore {
  constructor(
    readonly vaultId: string,
    readonly vaultName: string,
    private readonly adapter: DataAdapter
  ) {}

  async exists(path: string): Promise<boolean> {
    return this.adapter.exists(normalizePath(path));
  }

  async read(path: string): Promise<string | null> {
    const target = normalizePath(path);
    if (!(await this.adapter.exists(target))) return null;
    return this.adapter.read(target);
  }

  async write(path: string, content: string): Promise<void> {
    const target = normalizePath(path);
    await this.ensureParent(target);
    await this.adapter.write(target, content);
  }

  async listFiles(
    folder: string,
    options: { recursive?: boolean; extension?: string; limit?: number } = {}
  ): Promise<string[]> {
    const results: string[] = [];
    const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
    const queue = [normalizePath(folder || "/")];

    while (queue.length > 0 && results.length < limit) {
      const current = queue.shift()!;
      if (!(await this.adapter.exists(current))) continue;
      const listing = await this.adapter.list(current);
      for (const file of listing.files) {
        if (options.extension && !file.toLowerCase().endsWith(options.extension.toLowerCase())) continue;
        results.push(file);
        if (results.length >= limit) break;
      }
      if (options.recursive) queue.push(...listing.folders);
    }
    return results;
  }

  async listFolders(folder: string): Promise<string[]> {
    const target = normalizePath(folder || "/");
    if (!(await this.adapter.exists(target))) return [];
    const listing = await this.adapter.list(target);
    return listing.folders;
  }

  async stat(path: string): Promise<FileStat | null> {
    const result = await this.adapter.stat(normalizePath(path));
    if (!result) return null;
    return { size: result.size ?? 0, mtime: result.mtime ?? 0 };
  }

  private async ensureParent(path: string): Promise<void> {
    const segments = path.split("/").filter(Boolean);
    segments.pop();
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!(await this.adapter.exists(current))) {
        await this.adapter.mkdir(current);
      }
    }
  }
}

export class NodeVaultStore implements KnowledgeFileStore {
  constructor(
    readonly vaultId: string,
    readonly vaultName: string,
    private readonly basePath: string,
    private readonly runtime: NodeRuntime = NodeRuntime.get()
  ) {}

  private absolute(path: string): string {
    const nodePath = this.runtime.path!;
    return nodePath.join(this.basePath, ...path.split("/").filter(Boolean));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.runtime.fs!.promises.access(this.absolute(path));
      return true;
    } catch {
      return false;
    }
  }

  async read(path: string): Promise<string | null> {
    try {
      return await this.runtime.fs!.promises.readFile(this.absolute(path), "utf8");
    } catch {
      return null;
    }
  }

  async write(path: string, content: string): Promise<void> {
    const target = this.absolute(path);
    const dir = this.runtime.path!.dirname(target);
    await this.runtime.fs!.promises.mkdir(dir, { recursive: true });
    await this.runtime.fs!.promises.writeFile(target, content, "utf8");
  }

  async listFiles(
    folder: string,
    options: { recursive?: boolean; extension?: string; limit?: number } = {}
  ): Promise<string[]> {
    const limit = options.limit ?? Number.MAX_SAFE_INTEGER;
    const results: string[] = [];
    const queue = [folder || ""];

    while (queue.length > 0 && results.length < limit) {
      const current = queue.shift()!;
      let entries: Array<{ name: string; isDirectory(): boolean }>;
      try {
        entries = await this.runtime.fs!.promises.readdir(this.absolute(current), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const relative = joinPath(current, entry.name);
        if (entry.isDirectory()) {
          if (options.recursive) queue.push(relative);
          continue;
        }
        if (options.extension && !entry.name.toLowerCase().endsWith(options.extension.toLowerCase())) continue;
        results.push(relative);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async listFolders(folder: string): Promise<string[]> {
    try {
      const entries = await this.runtime.fs!.promises.readdir(this.absolute(folder || ""), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => joinPath(folder, entry.name));
    } catch {
      return [];
    }
  }

  async stat(path: string): Promise<FileStat | null> {
    try {
      const result = await this.runtime.fs!.promises.stat(this.absolute(path));
      return { size: result.size, mtime: result.mtimeMs };
    } catch {
      return null;
    }
  }
}

/** In-memory store: powers dry runs (nothing is written) and unit tests. */
export class MemoryVaultStore implements KnowledgeFileStore {
  readonly files = new Map<string, string>();

  constructor(
    readonly vaultId: string,
    readonly vaultName: string,
    seed: Record<string, string> = {}
  ) {
    Object.entries(seed).forEach(([path, content]) => this.files.set(path, content));
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || [...this.files.keys()].some((key) => key.startsWith(`${path}/`));
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async listFiles(
    folder: string,
    options: { recursive?: boolean; extension?: string; limit?: number } = {}
  ): Promise<string[]> {
    const prefix = folder ? `${folder.replace(/\/+$/, "")}/` : "";
    const matches = [...this.files.keys()].filter((path) => {
      if (prefix && !path.startsWith(prefix)) return false;
      if (!options.recursive && prefix && path.slice(prefix.length).includes("/")) return false;
      if (options.extension && !path.toLowerCase().endsWith(options.extension.toLowerCase())) return false;
      return true;
    });
    return options.limit ? matches.slice(0, options.limit) : matches;
  }

  async listFolders(folder: string): Promise<string[]> {
    const prefix = folder ? `${folder.replace(/\/+$/, "")}/` : "";
    const folders = new Set<string>();
    this.files.forEach((_, path) => {
      if (prefix && !path.startsWith(prefix)) return;
      const rest = path.slice(prefix.length);
      const segments = rest.split("/");
      if (segments.length > 1) folders.add(joinPath(folder, segments[0]));
    });
    return [...folders];
  }

  async stat(path: string): Promise<FileStat | null> {
    const content = this.files.get(path);
    if (content === undefined) return null;
    return { size: content.length, mtime: 0 };
  }
}

/** Wraps another store and records writes without performing them. */
export class DryRunVaultStore implements KnowledgeFileStore {
  readonly plannedWrites = new Map<string, string>();

  constructor(private readonly inner: KnowledgeFileStore) {}

  get vaultId(): string {
    return this.inner.vaultId;
  }

  get vaultName(): string {
    return this.inner.vaultName;
  }

  async exists(path: string): Promise<boolean> {
    return this.plannedWrites.has(path) || this.inner.exists(path);
  }

  async read(path: string): Promise<string | null> {
    return this.plannedWrites.get(path) ?? (await this.inner.read(path));
  }

  async write(path: string, content: string): Promise<void> {
    this.plannedWrites.set(path, content);
  }

  listFiles(folder: string, options?: { recursive?: boolean; extension?: string; limit?: number }): Promise<string[]> {
    return this.inner.listFiles(folder, options);
  }

  listFolders(folder: string): Promise<string[]> {
    return this.inner.listFolders(folder);
  }

  stat(path: string): Promise<FileStat | null> {
    return this.inner.stat(path);
  }
}
