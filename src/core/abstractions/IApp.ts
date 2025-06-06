import { IFileSystem } from "./IFileSystem";

export interface IWorkspace {
  /**
   * Get the active editor view
   */
  getActiveViewOfType<T>(type: any): T | null;

  /**
   * Get the active file
   */
  getActiveFile(): any;
}

export interface IVault extends IFileSystem {
  /**
   * Get abstract file by path
   */
  getAbstractFileByPath(path: string): any;
}

export interface IMetadataCache {
  /**
   * Get file cache
   */
  getFileCache(file: any): any;
}

export interface IApp {
  workspace: IWorkspace;
  vault: IVault;
  metadataCache: IMetadataCache;
}
