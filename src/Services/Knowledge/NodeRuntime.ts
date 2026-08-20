import { Logger } from "src/Utilities/Logger";

/**
 * Desktop-only Node access.
 *
 * Obsidian's own API can only reach the vault that is currently open, but the
 * knowledge system routes into several vaults that live at unrelated
 * filesystem locations. On desktop we therefore go through Node directly,
 * using the same `globalThis.require` probe the streaming transport uses.
 * On mobile every capability here reports unavailable and callers degrade to
 * the current vault only.
 */

export interface NodeFsLike {
  promises: {
    readFile(path: string, encoding: string): Promise<string>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, data: string, encoding: string): Promise<void>;
    mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
    readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
    stat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory(): boolean }>;
    access(path: string): Promise<void>;
  };
}

export interface NodePathLike {
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  resolve(...parts: string[]): string;
  sep: string;
}

export interface NodeZlibLike {
  inflateRawSync(buffer: Uint8Array): Uint8Array;
}

interface NodeOsLike {
  homedir(): string;
  platform(): string;
}

type NodeRequire = (moduleName: string) => unknown;

function tryRequire<T>(moduleName: string): T | undefined {
  try {
    const nodeRequire = (globalThis as typeof globalThis & { require?: NodeRequire }).require;
    if (!nodeRequire) return undefined;
    return nodeRequire(moduleName) as T;
  } catch (error) {
    Logger.debug(`[ChatGPT MD] Node module unavailable: ${moduleName}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

let cached: NodeRuntime | undefined;

export class NodeRuntime {
  readonly fs?: NodeFsLike;
  readonly path?: NodePathLike;
  readonly zlib?: NodeZlibLike;
  private readonly os?: NodeOsLike;

  private constructor() {
    this.fs = tryRequire<NodeFsLike>("fs");
    this.path = tryRequire<NodePathLike>("path");
    this.zlib = tryRequire<NodeZlibLike>("zlib");
    this.os = tryRequire<NodeOsLike>("os");
  }

  static get(): NodeRuntime {
    if (!cached) cached = new NodeRuntime();
    return cached;
  }

  /** Test seam: replace the singleton with a stub runtime. */
  static override(runtime: NodeRuntime | undefined): void {
    cached = runtime;
  }

  isAvailable(): boolean {
    return Boolean(this.fs?.promises && this.path);
  }

  supportsArchives(): boolean {
    return Boolean(this.zlib?.inflateRawSync);
  }

  homeDir(): string | undefined {
    try {
      return this.os?.homedir();
    } catch {
      return undefined;
    }
  }

  platform(): string {
    try {
      return this.os?.platform() || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Candidate locations of Obsidian's own vault list (`obsidian.json`).
   * Returned in priority order; callers try each until one parses.
   */
  obsidianConfigCandidates(): string[] {
    const path = this.path;
    const home = this.homeDir();
    if (!path || !home) return [];

    const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process
      ?.env;
    const appData = env?.APPDATA;
    const candidates: string[] = [];

    if (appData) candidates.push(path.join(appData, "obsidian", "obsidian.json"));
    candidates.push(path.join(home, "AppData", "Roaming", "obsidian", "obsidian.json"));
    candidates.push(path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"));
    candidates.push(path.join(home, ".config", "obsidian", "obsidian.json"));
    candidates.push(path.join(home, ".var", "app", "md.obsidian.Obsidian", "config", "obsidian", "obsidian.json"));
    return candidates;
  }
}
