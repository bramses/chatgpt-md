export interface IFile {
  path: string;
  basename: string;
  extension: string;
}

export interface IFileSystem {
  /**
   * Read file content
   */
  readFile(path: string): Promise<string>;

  /**
   * Write content to file
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Check if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * List files in directory
   */
  listFiles(path: string): Promise<string[]>;

  /**
   * Rename a file
   */
  renameFile(oldPath: string, newPath: string): Promise<void>;

  /**
   * Get file info
   */
  getFile(path: string): Promise<IFile | null>;

  /**
   * Create a directory
   */
  createDirectory(path: string): Promise<void>;
}
