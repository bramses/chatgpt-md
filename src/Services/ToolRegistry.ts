import { App } from "obsidian";
import { z } from "zod";
import { tool, zodSchema } from "ai";
import { VaultTools } from "./VaultTools";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { WebSearchService } from "./WebSearchService";
import { SettingsService } from "./SettingsService";

/**
 * Registry for managing AI tools
 */
export class ToolRegistry {
  private tools: Map<string, any> = new Map();

  constructor(
    private app: App,
    private vaultTools: VaultTools,
    private webSearchService: WebSearchService,
    private settingsService: SettingsService
  ) {
    this.registerDefaultTools();
  }

  /**
   * Register default tools with manual human-in-the-loop approval
   */
  private registerDefaultTools(): void {
    // Vault search tool - approval handled manually before execution
    const vaultSearchTool = tool({
      description:
        "Search the Obsidian vault for files by name or content. Returns file paths, names, and content previews. Use this to find relevant notes before reading them.",
      inputSchema: zodSchema(
        z.object({
          query: z
            .string()
            .describe(
              "The search query to find files. Can be keywords, topics, or phrases to search for in file names and content."
            ),
          limit: z
            .number()
            .optional()
            .default(10)
            .describe("Maximum number of search results to return. Default is 10, maximum is 50."),
        })
      ),
      execute: async (args: { query: string; limit?: number }) => {
        // Tool execution - approval is handled by the caller via ToolExecutor
        const results = await this.vaultTools.searchVault(args, {
          app: this.app,
          toolCallId: "",
          messages: [],
        });

        // Format results with markdown links for file paths
        return results.map((result) => ({
          ...result,
          path: `[${result.basename}](${result.path})`,
        }));
      },
    });
    this.registerTool("vault_search", vaultSearchTool);

    // File read tool - approval handled manually before execution
    const fileReadTool = tool({
      description:
        "Read the full contents of specific files from the vault. User will be asked to approve which files to share. Use this after searching to get complete file contents.",
      inputSchema: zodSchema(
        z.object({
          filePaths: z
            .array(z.string())
            .describe("Array of file paths to read. Use the paths returned from vault_search."),
        })
      ),
      execute: async (args: { filePaths: string[] }) => {
        // Tool execution - approval is handled by the caller via ToolExecutor
        return await this.vaultTools.readFiles(args, {
          app: this.app,
          toolCallId: "",
          messages: [],
        });
      },
    });
    this.registerTool("file_read", fileReadTool);

    // Web search tool - approval handled manually before execution
    const webSearchTool = tool({
      description:
        "Search the web for information on a topic. Returns titles, URLs, and snippets from search results. User will be asked to approve which results to share.",
      inputSchema: zodSchema(
        z.object({
          query: z
            .string()
            .describe("The search query to look up on the web"),
          limit: z
            .number()
            .optional()
            .default(5)
            .describe("Maximum number of search results to return. Default is 5, maximum is 10."),
        })
      ),
      execute: async (args: { query: string; limit?: number }) => {
        // Tool execution - approval is handled by the caller via ToolService
        const settings = this.settingsService.getSettings();
        return await this.webSearchService.searchWeb(
          args,
          settings.webSearchProvider,
          settings.webSearchApiKey,
          settings.webSearchApiUrl
        );
      },
    });
    this.registerTool("web_search", webSearchTool);
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

    const enabledTools: Record<string, any> = {};

    // Vault tools
    enabledTools.vault_search = this.tools.get("vault_search");
    enabledTools.file_read = this.tools.get("file_read");

    // Web search tool (check setting)
    if (settings.enableWebSearch) {
      enabledTools.web_search = this.tools.get("web_search");
    }

    return Object.keys(enabledTools).length > 0 ? enabledTools : undefined;
  }
}
