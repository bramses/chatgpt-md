import { App, normalizePath, TFile, TFolder } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { AGENT_FOLDER_TYPE } from "src/Constants";
import { FileService } from "./FileService";
import { FrontmatterManager } from "./FrontmatterManager";

export interface AgentData {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Service responsible for agent file CRUD and resolution
 */
export class AgentService {
  constructor(
    private app: App,
    private fileService: FileService,
    private frontmatterManager: FrontmatterManager
  ) {}

  /**
   * Get all agent files from the agent folder
   */
  getAgentFiles(settings: ChatGPT_MDSettings): TFile[] {
    const folder = this.app.vault.getAbstractFileByPath(settings.agentFolder);
    if (!(folder instanceof TFolder)) {
      return [];
    }
    return folder.children.filter((f): f is TFile => f instanceof TFile && f.extension === "md");
  }

  /**
   * Read an agent file and parse into frontmatter + body
   */
  async readAgent(file: TFile): Promise<AgentData> {
    const content = await this.app.vault.read(file);
    const frontmatter = (await this.frontmatterManager.readFrontmatter(file)) || {};
    const body = this.extractBody(content);
    return { frontmatter, body };
  }

  /**
   * Resolve an agent by name, returning its data or null if not found
   */
  async resolveAgentByName(agentName: string, settings: ChatGPT_MDSettings): Promise<AgentData | null> {
    const agentFiles = this.getAgentFiles(settings);
    const agentFile = agentFiles.find((f) => f.basename === agentName);
    if (!agentFile) return null;
    return this.readAgent(agentFile);
  }

  /**
   * Create a new agent file
   */
  async createAgentFile(
    name: string,
    model: string,
    temperature: number,
    message: string,
    settings: ChatGPT_MDSettings
  ): Promise<TFile> {
    await this.fileService.ensureFolderExists(settings.agentFolder, AGENT_FOLDER_TYPE);

    const sanitizedName = this.fileService.sanitizeFileName(name);
    let filePath = normalizePath(`${settings.agentFolder}/${sanitizedName}.md`);

    for (let i = 1; await this.app.vault.adapter.exists(filePath); i++) {
      filePath = normalizePath(`${settings.agentFolder}/${sanitizedName} (${i}).md`);
    }

    const frontmatter = this.buildAgentFrontmatter(model, temperature);
    const content = `${frontmatter}\n${message}`;

    return this.app.vault.create(filePath, content);
  }

  /**
   * Extract body content (everything after frontmatter) from file content
   */
  private extractBody(content: string): string {
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
    if (!frontmatterMatch) {
      return content.trim();
    }
    return content.slice(frontmatterMatch[0].length).trim();
  }

  /**
   * Build frontmatter YAML for a new agent file
   */
  private buildAgentFrontmatter(model: string, temperature: number): string {
    const lines = ["---", `model: ${model}`, `temperature: ${temperature}`, "stream: true", "---"];
    return lines.join("\n");
  }
}
