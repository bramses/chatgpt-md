import { App, Modal, Notice, Setting } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { CallbackCommandHandler, CommandMetadata } from "../CommandHandler";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";
import { PluginIntegrationStatusModal } from "src/Views/PluginIntegrationStatusModal";
import { CAPTURE_DEFINITIONS, CaptureKind } from "src/Services/Knowledge/CaptureService";
import { PLUGIN_PREFIX } from "src/Constants";
import { Logger } from "src/Utilities/Logger";

/**
 * Commands that make the vault's other plugins behave like parts of one system.
 *
 * Every one of these works in a vault with no community plugins at all: capture
 * writes plain Markdown, the home note falls back to generated lists instead of
 * Dataview queries, and canvas generation simply does nothing where Canvas is
 * off. The plugins are enhancements, never requirements.
 */

function requireService(services: ServiceContainer): KnowledgeImportService {
  const service = services.knowledgeImportService;
  if (!service) throw new Error("Knowledge importer is not available.");
  return service;
}

function fail(action: string, error: unknown): void {
  Logger.error(`[ChatGPT MD] ${action} failed`, { error });
  new Notice(`${PLUGIN_PREFIX} ${action} failed: ${error instanceof Error ? error.message : String(error)}`, 9000);
}

/** Two fields, no ceremony: this is the fast path from thought to note. */
class CaptureModal extends Modal {
  private title = "";
  private body = "";

  constructor(
    app: App,
    private readonly kind: CaptureKind,
    private readonly onSubmit: (title: string, body: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const definition = CAPTURE_DEFINITIONS[this.kind];
    contentEl.empty();
    contentEl.createEl("h2", { text: `Capture: ${definition.label.toLowerCase()}` });

    new Setting(contentEl)
      .setName("Title")
      .addText((text) => text.setPlaceholder(definition.label).onChange((value) => (this.title = value)));

    new Setting(contentEl)
      .setName(definition.sections[0])
      .addTextArea((text) => text.setPlaceholder("Optional").onChange((value) => (this.body = value)));

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Capture")
          .setCta()
          .onClick(() => {
            if (!this.title.trim() && !this.body.trim()) {
              new Notice(`${PLUGIN_PREFIX} Nothing to capture yet.`);
              return;
            }
            this.close();
            this.onSubmit(this.title, this.body);
          })
      )
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** One handler class covers every capture kind. */
export class CaptureHandler implements CallbackCommandHandler {
  constructor(
    private services: ServiceContainer,
    private readonly kind: CaptureKind
  ) {}

  async execute(): Promise<void> {
    const service = requireService(this.services);
    new CaptureModal(this.services.app, this.kind, (title, body) => {
      void (async () => {
        try {
          const result = await service.capture(this.kind, title, body);
          new Notice(
            `${PLUGIN_PREFIX} Captured to ${result.path}` +
              (result.dailyNotePath ? ` and linked in ${result.dailyNotePath}` : "")
          );
          await this.services.app.workspace.openLinkText(result.path, "", false);
        } catch (error) {
          fail("Capture", error);
        }
      })();
    }).open();
  }

  getCommand(): CommandMetadata {
    const definition = CAPTURE_DEFINITIONS[this.kind];
    return {
      id: `knowledge-capture-${this.kind}`,
      name: `Capture ${definition.label.toLowerCase()}`,
      icon: "plus-circle",
    };
  }
}

export const CAPTURE_KINDS: CaptureKind[] = [
  "idea",
  "dream",
  "memory",
  "person",
  "song-idea",
  "question",
  "book",
  "film",
  "project-decision",
  "learned",
  "source-annotation",
];

export class PluginIntegrationStatusHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    new PluginIntegrationStatusModal(this.services.app, requireService(this.services)).open();
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-plugin-status", name: "Plugin integration status", icon: "plug" };
  }
}

export class RefreshPluginCapabilitiesHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const service = requireService(this.services);
      service.pluginIntegrations().invalidate();
      const statuses = await service.pluginStatus({ forceRefresh: true });
      const summary = statuses
        .map((status) => {
          const count = Object.values(status.profile.capabilities).filter(Boolean).length;
          return `${status.vault.name}: ${status.reachable ? `${count} capabilities` : "unreachable"}`;
        })
        .join("\n");
      new Notice(`${PLUGIN_PREFIX} Capabilities refreshed.\n${summary}`, 12000);
    } catch (error) {
      fail("Refresh plugin capabilities", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-refresh-capabilities", name: "Refresh plugin capabilities", icon: "refresh-ccw" };
  }
}

export class OpenKnowledgeHomeHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const path = await requireService(this.services).writeHome();
      await this.services.app.workspace.openLinkText(path, "", false);
    } catch (error) {
      fail("Open knowledge home", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-open-home", name: "Open knowledge home", icon: "home" };
  }
}

export class WriteSystemStatusHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const path = await requireService(this.services).writeStatusNote();
      await this.services.app.workspace.openLinkText(path, "", false);
    } catch (error) {
      fail("Write system status", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-write-status-note", name: "Write knowledge system status note", icon: "activity" };
  }
}

export class GenerateCanvasesHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const paths = await requireService(this.services).generateCanvases();
      new Notice(
        paths.length > 0
          ? `${PLUGIN_PREFIX} Generated ${paths.length} canvas view(s) in 99 System/Canvases.`
          : `${PLUGIN_PREFIX} Nothing to project yet, or Canvas is disabled in that vault.`
      );
    } catch (error) {
      fail("Generate canvases", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-generate-canvases", name: "Generate knowledge canvases", icon: "layout-dashboard" };
  }
}

export class InstallTemplatesHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const paths = await requireService(this.services).installTemplates();
      new Notice(
        paths.length > 0
          ? `${PLUGIN_PREFIX} Installed ${paths.length} template(s). Existing templates were left alone.`
          : `${PLUGIN_PREFIX} All templates already exist.`
      );
    } catch (error) {
      fail("Install templates", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-install-templates", name: "Install knowledge note templates", icon: "file-plus" };
  }
}

export class EnsureProjectContextHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const paths = await requireService(this.services).ensureProjectContext();
      new Notice(
        paths.length > 0
          ? `${PLUGIN_PREFIX} Created ${paths.length} context note(s):\n${paths.join("\n")}`
          : `${PLUGIN_PREFIX} Every project vault already has its context notes.`,
        9000
      );
    } catch (error) {
      fail("Create project context notes", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-project-context", name: "Create project vault context notes", icon: "folder-tree" };
  }
}

/** Structural checks only: no AI, no network, no writes. */
export class ValidateKnowledgeGraphHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const report = await requireService(this.services).validateKnowledgeGraph();
      new Notice(`${PLUGIN_PREFIX} ${report.join("\n")}`, 15000);
    } catch (error) {
      fail("Validate knowledge graph", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-validate-graph", name: "Validate knowledge graph", icon: "check-circle" };
  }
}
