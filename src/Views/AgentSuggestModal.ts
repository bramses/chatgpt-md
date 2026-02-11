import { App, MarkdownView, Notice, SuggestModal, TFile } from "obsidian";
import { AgentService } from "src/Services/AgentService";
import { SettingsService } from "src/Services/SettingsService";
import { ChatGPT_MDSettings } from "src/Models/Config";

interface AgentItem {
  title: string;
  file: TFile;
}

/**
 * Modal for selecting an agent from the agent folder
 */
export class AgentSuggestModal extends SuggestModal<AgentItem> {
  private agents: AgentItem[];

  constructor(
    app: App,
    private agentService: AgentService,
    private settingsService: SettingsService,
    private settings: ChatGPT_MDSettings
  ) {
    super(app);
    this.agents = this.loadAgents();
    this.limit = this.agents.length;
    this.setPlaceholder(this.agents.length > 0 ? "Select an agent" : "No agents found");
  }

  private loadAgents(): AgentItem[] {
    return this.agentService
      .getAgentFiles(this.settings)
      .map((file) => ({ title: file.basename, file }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  getSuggestions(query: string): AgentItem[] {
    if (!query) return this.agents;
    return this.agents.filter((agent) => agent.title.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(agent: AgentItem, el: HTMLElement): void {
    el.createEl("div", { text: agent.title });
  }

  async onChooseSuggestion(agent: AgentItem): Promise<void> {
    try {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!activeView) {
        new Notice("[ChatGPT MD] No active note found");
        return;
      }

      await this.settingsService.updateFrontmatterField(activeView.editor, "agent", agent.title);
      new Notice(`Agent set to "${agent.title}"`);
    } catch (error) {
      console.error("[ChatGPT MD] Error setting agent:", error);
      new Notice(`[ChatGPT MD] Error setting agent: ${error.message}`);
    }
  }
}
