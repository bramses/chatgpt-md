import { App, Modal, Setting } from "obsidian";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";
import { VaultIntegrationStatus } from "src/Services/Knowledge/PluginIntegrationService";
import { KnowledgeCapability } from "src/Models/Knowledge/PluginCapability";

/**
 * What the knowledge system can actually do in each vault.
 *
 * Plugins are vault-local, so this is reported per vault and never as one
 * global list. A capability appears as available only where it was observed;
 * nothing here implies an integration that has not been validated, and nothing
 * here changes any configuration.
 */

const SHOWN: readonly KnowledgeCapability[] = [
  "query-engine",
  "full-text-search",
  "semantic-search",
  "tasks",
  "task-notes",
  "daily-notes",
  "calendar",
  "templates",
  "quick-capture",
  "visual-canvas",
  "drawing",
  "pdf-annotation",
  "ai-client",
  "external-api",
  "git",
  "sync",
];

export class PluginIntegrationStatusModal extends Modal {
  constructor(
    app: App,
    private readonly service: KnowledgeImportService
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Plugin integration status" });
    contentEl.createEl("p", {
      text:
        "Plugins are per vault. Knowledge is always written as plain Markdown; the capabilities below are optional extras " +
        "that are used only in the vault where they exist. Nothing is installed, enabled or configured by this plugin.",
    });

    const loading = contentEl.createEl("p", { text: "Scanning vaults..." });

    try {
      const statuses = await this.service.pluginStatus({ forceRefresh: true });
      loading.remove();
      statuses.forEach((status) => this.renderVault(contentEl, status));
    } catch (error) {
      loading.setText(`Could not scan: ${error instanceof Error ? error.message : String(error)}`);
    }

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Close")
        .setCta()
        .onClick(() => this.close())
    );
  }

  private renderVault(container: HTMLElement, status: VaultIntegrationStatus): void {
    container.createEl("h3", { text: `${status.vault.name} (${status.vault.kind})` });

    if (!status.reachable) {
      container.createEl("p", { text: "Not reachable from this device. Nothing is written here." });
      return;
    }
    if (!status.profile.inspected) {
      container.createEl("p", { text: "Plain Markdown vault: no readable Obsidian configuration." });
      return;
    }

    const enabled = status.profile.plugins.filter((plugin) => plugin.enabled);
    container.createEl("p", {
      text: `${enabled.length} plugin(s) enabled, ${status.profile.plugins.length} installed.`,
    });

    SHOWN.forEach((capability) => {
      const available = status.profile.capabilities[capability];
      const providers = enabled
        .filter((plugin) => plugin.capabilities.includes(capability))
        .map((plugin) => plugin.name)
        .join(", ");
      container.createEl("p", {
        text: `${available ? "yes" : "  - "}  ${capability}${providers ? ` (${providers})` : available ? " (core)" : ""}`,
      });
    });

    [...status.profile.warnings, ...status.repository.warnings].forEach((warning) =>
      container.createEl("p", { text: `warning: ${warning}` })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
