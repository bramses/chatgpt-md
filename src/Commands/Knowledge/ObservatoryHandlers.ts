import { App, Editor, Modal, Notice, Setting } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { CallbackCommandHandler, CommandMetadata, EditorCommandHandler } from "../CommandHandler";
import { KnowledgeImportService } from "src/Services/Knowledge/KnowledgeImportService";
import { PLUGIN_PREFIX } from "src/Constants";
import { Logger } from "src/Utilities/Logger";

/**
 * Commands that point away from the archive.
 *
 * These exist because the failure mode of a personal knowledge system is not
 * losing data - it is becoming an oracle: a place to look for certainty about
 * yourself, where every question produces a longer answer and the archive
 * quietly starts deciding who you are. Each command here reduces interpretation
 * rather than increasing it.
 */

function requireService(services: ServiceContainer): KnowledgeImportService {
  const service = services.knowledgeImportService;
  if (!service) throw new Error("Knowledge importer is not available.");
  return service;
}

function reportError(action: string, error: unknown): void {
  Logger.error(`[ChatGPT MD] ${action} failed`, { error });
  new Notice(`${PLUGIN_PREFIX} ${action} failed: ${error instanceof Error ? error.message : String(error)}`, 9000);
}

/** Small prompt for a sentence the person wants to test about themselves. */
class HypothesisModal extends Modal {
  private value = "";

  constructor(
    app: App,
    private readonly title: string,
    private readonly description: string,
    private readonly placeholder: string,
    private readonly onSubmit: (value: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    contentEl.createEl("p", { text: this.description });

    new Setting(contentEl).addTextArea((text) =>
      text.setPlaceholder(this.placeholder).onChange((value) => {
        this.value = value.trim();
      })
    );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Look")
          .setCta()
          .onClick(() => {
            if (!this.value) {
              new Notice(`${PLUGIN_PREFIX} Write the sentence you want to test first.`);
              return;
            }
            this.close();
            this.onSubmit(this.value);
          })
      )
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Take a story the person tells about themselves and look for what complicates
 * it. Never replaces one story with a better one.
 */
export class ChallengeCurrentStoryHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    const service = requireService(this.services);

    new HypothesisModal(
      this.services.app,
      "Challenge a story",
      "Write something you believe about yourself. The vault will look for what complicates it, not for what confirms it.",
      "I always retreat when things are uncertain.",
      (hypothesis) => {
        void (async () => {
          try {
            new Notice(`${PLUGIN_PREFIX} Looking for what complicates this...`);
            const result = await service.challengeStory(hypothesis);

            if (result.loop) {
              new Notice(`${PLUGIN_PREFIX}\n${service.describeLoop(result.loop)}`, 20000);
              return;
            }
            if (result.path) {
              await this.services.app.workspace.openLinkText(result.path, "", false);
            }
          } catch (error) {
            reportError("Challenge story", error);
          }
        })();
      }
    ).open();
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-challenge-story", name: "Challenge a story about myself", icon: "scale" };
  }
}

/** Possibilities the archive does not predict. */
export class OpenHorizonHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      new Notice(`${PLUGIN_PREFIX} Opening the horizon...`);
      const path = await requireService(this.services).openHorizon();
      await this.services.app.workspace.openLinkText(path, "", false);
    } catch (error) {
      reportError("Open horizon", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-open-horizon", name: "Open horizon", icon: "sunrise" };
  }
}

/** Resurface something old rather than something relevant. */
export class ShowSomethingForgottenHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const picks = await requireService(this.services).somethingForgotten(3);
      if (picks.length === 0) {
        new Notice(`${PLUGIN_PREFIX} Nothing has gone quiet long enough yet.`);
        return;
      }
      const lines = picks.map((pick) => `- ${pick.concept.title} (${pick.reason})`).join("\n");
      new Notice(`${PLUGIN_PREFIX} From further back:\n${lines}`, 15000);
      await this.services.app.workspace.openLinkText(picks[0].concept.path, "", false);
    } catch (error) {
      reportError("Show something forgotten", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-show-forgotten", name: "Show me something I forgot", icon: "history" };
  }
}

/** Put two distant notes beside each other. No claim, no explanation. */
export class UnexpectedConnectionHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const path = await requireService(this.services).strangeConnection();
      if (!path) {
        new Notice(`${PLUGIN_PREFIX} Not enough notes yet to put two distant ones together.`);
        return;
      }
      await this.services.app.workspace.openLinkText(path, "", false);
    } catch (error) {
      reportError("Unexpected connection", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-unexpected-connection", name: "Unexpected connection", icon: "shuffle" };
  }
}

/** Ask whether old readings still fit, and let them be retired. */
export class ReviewPersonalModelsHandler implements CallbackCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(): Promise<void> {
    try {
      const result = await requireService(this.services).reviewPersonalModels();
      new Notice(
        `${PLUGIN_PREFIX} ${result.candidates.length} reading(s) up for review` +
          (result.syncedFromNotes > 0
            ? `, ${result.syncedFromNotes} status change(s) picked up from your notes.`
            : "."),
        9000
      );
      await this.services.app.workspace.openLinkText(result.path, "", false);
    } catch (error) {
      reportError("Review personal models", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-review-models", name: "Review personal models", icon: "leaf" };
  }
}

/**
 * End a reflection instead of extending it. Appends one thing worth keeping,
 * one question left open, and one small thing that could be lived instead.
 */
export class EnoughAnalysisHandler implements EditorCommandHandler {
  constructor(private services: ServiceContainer) {}

  async execute(editor: Editor): Promise<void> {
    const service = requireService(this.services);
    const selection = editor.somethingSelected() ? editor.getSelection() : editor.getValue();

    if (!selection.trim()) {
      new Notice(`${PLUGIN_PREFIX} Nothing to close here.`);
      return;
    }

    try {
      new Notice(`${PLUGIN_PREFIX} Closing this off...`);
      const text = await service.enoughAnalysis(selection);
      const lastLine = editor.lastLine();
      editor.replaceRange(`\n\n---\n\n${text}\n`, { line: lastLine, ch: editor.getLine(lastLine).length });
    } catch (error) {
      reportError("Enough analysis", error);
    }
  }

  getCommand(): CommandMetadata {
    return { id: "knowledge-enough-analysis", name: "Enough analysis, back to life", icon: "door-open" };
  }
}
