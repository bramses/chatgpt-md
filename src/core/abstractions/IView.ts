import { IFile } from "./IFileSystem";

export interface IView {
  /**
   * Get the file associated with this view
   */
  getFile(): IFile | null;

  /**
   * Get the content of the view
   */
  getContent(): Promise<string>;

  /**
   * Set the content of the view
   */
  setContent(content: string): Promise<void>;

  /**
   * Get the file path
   */
  getPath(): string | null;
}
