import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Tool Registry
 *
 * Central registry for managing AI tool definitions.
 * Handles tool registration, retrieval, and filtering based on settings.
 */
export class ToolRegistry {
  private tools: Map<string, any> = new Map();

  /**
   * Register a new tool definition
   *
   * @param name - Unique identifier for the tool
   * @param toolDef - Tool definition from AI SDK (created via `tool()`)
   */
  registerTool(name: string, toolDef: any): void {
    if (this.tools.has(name)) {
      console.warn(`[ChatGPT MD] Tool already registered, overwriting: ${name}`);
    }

    this.tools.set(name, toolDef);
  }

  /**
   * Get a specific tool by name
   *
   * @param name - Tool identifier
   * @returns Tool definition or undefined if not found
   */
  getTool(name: string): any | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools as an object
   *
   * @returns Object mapping tool names to tool definitions
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
   *
   * Filters tools according to:
   * - Master toggle: enableToolCalling
   * - Web search toggle: enableWebSearch
   *
   * @param settings - Plugin settings
   * @returns Object mapping enabled tool names to definitions, or undefined if tool calling disabled
   */
  getEnabledTools(settings: ChatGPT_MDSettings): Record<string, any> | undefined {
    // Master toggle for all tool calling
    if (!settings.enableToolCalling) {
      return undefined;
    }

    const enabledTools: Record<string, any> = {};

    // Vault tools (always enabled when tool calling is enabled)
    const vaultSearchTool = this.tools.get("vault_search");
    const fileReadTool = this.tools.get("file_read");

    if (vaultSearchTool) {
      enabledTools.vault_search = vaultSearchTool;
    }
    if (fileReadTool) {
      enabledTools.file_read = fileReadTool;
    }

    // Web search tool (check separate setting)
    if (settings.enableWebSearch) {
      const webSearchTool = this.tools.get("web_search");
      if (webSearchTool) {
        enabledTools.web_search = webSearchTool;
      }
    }

    // Return undefined if no tools are enabled
    return Object.keys(enabledTools).length > 0 ? enabledTools : undefined;
  }
}
