import { DataAdapter, normalizePath } from "obsidian";
import { FileStat } from "./KnowledgeFileStore";
import { NodeRuntime } from "./NodeRuntime";
import { joinPath } from "src/Utilities/KnowledgeText";

/**
 * Reads ingestion input (export ZIP/JSON, inbox files) from either an absolute
 * filesystem path (desktop) or a path inside the currently open vault.
 * Ingestion adapters depend on this interface only, so they work identically
 * for a hand-picked export and for a watched inbox folder.
 */
export interface SourceFileReader {
  isAbsoluteSupported(): boolean;
  exists(ref: string): Promise<boolean>;
  readText(ref: string): Promise<string>;
  readBinary(ref: string): Promise<Uint8Array>;
  stat(ref: string): Promise<FileStat | null>;
  listFiles(folder: string): Promise<string[]>;
}

const ABSOLUTE_PATTERN = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/;

export function looksAbsolute(ref: string): boolean {
  return ABSOLUTE_PATTERN.test(ref || "");
}

/** Reads paths relative to the vault Obsidian currently has open. */
export class VaultSourceReader implements SourceFileReader {
  constructor(private readonly adapter: DataAdapter) {}

  isAbsoluteSupported(): boolean {
    return false;
  }

  exists(ref: string): Promise<boolean> {
    return this.adapter.exists(normalizePath(ref));
  }

  readText(ref: string): Promise<string> {
    return this.adapter.read(normalizePath(ref));
  }

  async readBinary(ref: string): Promise<Uint8Array> {
    const buffer = await this.adapter.readBinary(normalizePath(ref));
    return new Uint8Array(buffer);
  }

  async stat(ref: string): Promise<FileStat | null> {
    const result = await this.adapter.stat(normalizePath(ref));
    return result ? { size: result.size ?? 0, mtime: result.mtime ?? 0 } : null;
  }

  async listFiles(folder: string): Promise<string[]> {
    const target = normalizePath(folder || "/");
    if (!(await this.adapter.exists(target))) return [];
    const listing = await this.adapter.list(target);
    return listing.files;
  }
}

/** Reads absolute paths anywhere on disk. Desktop only. */
export class NodeSourceReader implements SourceFileReader {
  constructor(private readonly runtime: NodeRuntime = NodeRuntime.get()) {}

  isAbsoluteSupported(): boolean {
    return this.runtime.isAvailable();
  }

  async exists(ref: string): Promise<boolean> {
    try {
      await this.runtime.fs!.promises.access(ref);
      return true;
    } catch {
      return false;
    }
  }

  readText(ref: string): Promise<string> {
    return this.runtime.fs!.promises.readFile(ref, "utf8");
  }

  async readBinary(ref: string): Promise<Uint8Array> {
    const data = await this.runtime.fs!.promises.readFile(ref);
    return new Uint8Array(data);
  }

  async stat(ref: string): Promise<FileStat | null> {
    try {
      const result = await this.runtime.fs!.promises.stat(ref);
      return { size: result.size, mtime: result.mtimeMs };
    } catch {
      return null;
    }
  }

  async listFiles(folder: string): Promise<string[]> {
    try {
      const entries = await this.runtime.fs!.promises.readdir(folder, { withFileTypes: true });
      return entries
        .filter((entry) => !entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => this.runtime.path!.join(folder, entry.name));
    } catch {
      return [];
    }
  }
}

/** Routes each path to the vault reader or the filesystem reader. */
export class CompositeSourceReader implements SourceFileReader {
  constructor(
    private readonly vaultReader: SourceFileReader,
    private readonly nodeReader: SourceFileReader
  ) {}

  private pick(ref: string): SourceFileReader {
    return looksAbsolute(ref) && this.nodeReader.isAbsoluteSupported() ? this.nodeReader : this.vaultReader;
  }

  isAbsoluteSupported(): boolean {
    return this.nodeReader.isAbsoluteSupported();
  }

  exists(ref: string): Promise<boolean> {
    return this.pick(ref).exists(ref);
  }

  readText(ref: string): Promise<string> {
    return this.pick(ref).readText(ref);
  }

  readBinary(ref: string): Promise<Uint8Array> {
    return this.pick(ref).readBinary(ref);
  }

  stat(ref: string): Promise<FileStat | null> {
    return this.pick(ref).stat(ref);
  }

  async listFiles(folder: string): Promise<string[]> {
    const files = await this.pick(folder).listFiles(folder);
    return files.map((file) => (looksAbsolute(file) ? file : joinPath(...file.split("/"))));
  }
}
