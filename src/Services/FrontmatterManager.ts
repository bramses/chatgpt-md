import { App, TFile } from "obsidian";

/**
 * Centralized FrontmatterManager class for handling all frontmatter operations
 * using Obsidian's built-in methods only. This class provides a clean, focused
 * interface for frontmatter CRUD operations without mixing other concerns.
 */
export class FrontmatterManager {
  constructor(private app: App) {}

  /**
   * Read frontmatter from a file using Obsidian's built-in metadata cache
   * @param file - The TFile to read frontmatter from
   * @returns Promise resolving to frontmatter object or null if no frontmatter exists
   */
  async readFrontmatter(file: TFile): Promise<Record<string, any> | null> {
    try {
      // Use Obsidian's metadata cache to get frontmatter
      const fileCache = this.app.metadataCache.getFileCache(file);

      if (!fileCache?.frontmatter) {
        return null;
      }

      // Create a copy to avoid mutations affecting the cache
      return { ...fileCache.frontmatter };
    } catch (error) {
      console.error("[FrontmatterManager] Error reading frontmatter:", error);
      return null;
    }
  }

  /**
   * Write complete frontmatter to a file using Obsidian's built-in file manager
   * @param file - The TFile to write frontmatter to
   * @param frontmatter - The frontmatter object to write
   */
  async writeFrontmatter(file: TFile, frontmatter: Record<string, any>): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (existingFrontmatter) => {
        // Clear existing frontmatter and replace with new
        Object.keys(existingFrontmatter).forEach((key) => {
          delete existingFrontmatter[key];
        });

        // Add new frontmatter
        Object.assign(existingFrontmatter, frontmatter);
      });
    } catch (error) {
      console.error("[FrontmatterManager] Error writing frontmatter:", error);
      throw new Error(`Failed to write frontmatter: ${error.message}`);
    }
  }

  /**
   * Update a single field in the frontmatter
   * @param file - The TFile to update
   * @param key - The frontmatter key to update
   * @param value - The new value for the key
   */
  async updateFrontmatterField(file: TFile, key: string, value: any): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[key] = value;
      });
    } catch (error) {
      console.error("[FrontmatterManager] Error updating frontmatter field:", error);
      throw new Error(`Failed to update frontmatter field '${key}': ${error.message}`);
    }
  }

  /**
   * Merge multiple fields into existing frontmatter
   * @param file - The TFile to update
   * @param updates - Object containing key-value pairs to merge
   */
  async mergeFrontmatter(file: TFile, updates: Record<string, any>): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        // Merge updates into existing frontmatter
        Object.assign(frontmatter, updates);
      });
    } catch (error) {
      console.error("[FrontmatterManager] Error merging frontmatter:", error);
      throw new Error(`Failed to merge frontmatter: ${error.message}`);
    }
  }

  /**
   * Check if a file has frontmatter
   * @param file - The TFile to check
   * @returns True if file has frontmatter, false otherwise
   */
  hasFrontmatter(file: TFile): boolean {
    try {
      const fileCache = this.app.metadataCache.getFileCache(file);
      return !!(fileCache?.frontmatter && Object.keys(fileCache.frontmatter).length > 0);
    } catch (error) {
      console.error("[FrontmatterManager] Error checking frontmatter existence:", error);
      return false;
    }
  }

  /**
   * Remove a specific field from frontmatter
   * @param file - The TFile to update
   * @param key - The frontmatter key to remove
   */
  async removeFrontmatterField(file: TFile, key: string): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        delete frontmatter[key];
      });
    } catch (error) {
      console.error("[FrontmatterManager] Error removing frontmatter field:", error);
      throw new Error(`Failed to remove frontmatter field '${key}': ${error.message}`);
    }
  }

  /**
   * Remove multiple fields from frontmatter
   * @param file - The TFile to update
   * @param keys - Array of frontmatter keys to remove
   */
  async removeFrontmatterFields(file: TFile, keys: string[]): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        keys.forEach((key) => {
          delete frontmatter[key];
        });
      });
    } catch (error) {
      console.error("[FrontmatterManager] Error removing frontmatter fields:", error);
      throw new Error(`Failed to remove frontmatter fields: ${error.message}`);
    }
  }

  /**
   * Clear all frontmatter from a file
   * @param file - The TFile to clear frontmatter from
   */
  async clearFrontmatter(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        // Remove all existing keys
        Object.keys(frontmatter).forEach((key) => {
          delete frontmatter[key];
        });
      });
    } catch (error) {
      console.error("[FrontmatterManager] Error clearing frontmatter:", error);
      throw new Error(`Failed to clear frontmatter: ${error.message}`);
    }
  }

  /**
   * Get a specific field value from frontmatter
   * @param file - The TFile to read from
   * @param key - The frontmatter key to get
   * @param defaultValue - Default value to return if key doesn't exist
   * @returns The value of the specified key or defaultValue
   */
  async getFrontmatterField<T = any>(file: TFile, key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const frontmatter = await this.readFrontmatter(file);

      if (!frontmatter || !(key in frontmatter)) {
        return defaultValue;
      }

      return frontmatter[key] as T;
    } catch (error) {
      console.error("[FrontmatterManager] Error getting frontmatter field:", error);
      return defaultValue;
    }
  }

  /**
   * Check if a specific field exists in frontmatter
   * @param file - The TFile to check
   * @param key - The frontmatter key to check for
   * @returns True if the key exists, false otherwise
   */
  async hasFrontmatterField(file: TFile, key: string): Promise<boolean> {
    try {
      const frontmatter = await this.readFrontmatter(file);
      return !!(frontmatter && key in frontmatter);
    } catch (error) {
      console.error("[FrontmatterManager] Error checking frontmatter field:", error);
      return false;
    }
  }
}
