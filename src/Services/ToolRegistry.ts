import { App } from "obsidian";
import { z } from "zod";
import { VaultTools } from "./VaultTools";
import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Registry for managing AI tools
 */
export class ToolRegistry {
  private tools: Map<string, any> = new Map();

  constructor(
    private app: App,
    private vaultTools: VaultTools
  ) {
    this.registerDefaultTools();
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Vault search tool
    const vaultSearchTool: any = {
      description: 'Search the Obsidian vault for files by name or content. Returns file paths, names, and content previews. Use this to find relevant notes before reading them.',
      parameters: z.object({
        query: z.string().describe('The search query to find files. Can be keywords, topics, or phrases to search for in file names and content.'),
        limit: z.number().optional().default(10).describe('Maximum number of search results to return. Default is 10, maximum is 50.'),
      }),
    };
    this.registerTool("vault_search", vaultSearchTool);

    // File read tool
    const fileReadTool: any = {
      description: 'Read the full contents of specific files from the vault. User will be asked to approve which files to share. Use this after searching to get complete file contents.',
      parameters: z.object({
        filePaths: z.array(z.string()).describe('Array of file paths to read. Use the paths returned from vault_search.'),
      }),
    };
    this.registerTool("file_read", fileReadTool);
  }

  /**
   * Register a new tool
   */
  registerTool(name: string, toolDef: any): void {
    this.tools.set(name, toolDef);
    console.log(`[ChatGPT MD] Registered tool: ${name}`);
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): any | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Record<string, any> {
    const toolsObject: Record<string, any> = {};
    this.tools.forEach((toolDef, name) => {
      toolsObject[name] = toolDef;
    });
    return toolsObject;
  }

  /**
   * Get tools enabled for a request based on settings
   */
  getEnabledTools(settings: ChatGPT_MDSettings): Record<string, any> | undefined {
    if (!settings.enableToolCalling) {
      return undefined;
    }

    return this.getAllTools();
  }
}
