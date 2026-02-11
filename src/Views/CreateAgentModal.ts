import { App, Modal, Notice, Setting } from "obsidian";
import { AgentService } from "src/Services/AgentService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ServiceContainer } from "src/core/ServiceContainer";
import { AGENT_WIZARD_SYSTEM_PROMPT } from "src/Constants";
import { getDefaultApiUrls } from "src/Commands/CommandUtilities";

type WizardStep = "mode-select" | "wizard-input" | "wizard-loading" | "manual-form";

/**
 * Modal for creating a new agent with manual form or AI wizard
 */
export class CreateAgentModal extends Modal {
  private name = "";
  private model = "";
  private temperature = 0.7;
  private message = "";
  private modelInputEl?: HTMLInputElement;

  // Wizard state
  private step: WizardStep = "mode-select";
  private wizardModel = "";
  private wizardIdea = "";
  private cameFromWizard = false;

  constructor(
    app: App,
    private agentService: AgentService,
    private settings: ChatGPT_MDSettings,
    private availableModels: string[],
    private services?: ServiceContainer
  ) {
    super(app);
  }

  onOpen(): void {
    if (!this.services || this.availableModels.length === 0) {
      this.step = "manual-form";
    }
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();

    switch (this.step) {
      case "mode-select":
        this.renderModeSelect();
        break;
      case "wizard-input":
        this.renderWizardInput();
        break;
      case "wizard-loading":
        this.renderWizardLoading();
        break;
      case "manual-form":
        this.renderManualForm();
        break;
    }
  }

  private navigateTo(step: WizardStep): void {
    this.step = step;
    this.render();
  }

  // ── Step: Mode Selection ──────────────────────────────────

  private renderModeSelect(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Create New Agent" });

    const description = contentEl.createEl("p", {
      text: "How would you like to create your agent?",
    });
    description.style.color = "var(--text-muted)";
    description.style.marginBottom = "16px";

    const cardsContainer = contentEl.createDiv();
    cardsContainer.style.display = "flex";
    cardsContainer.style.gap = "12px";
    cardsContainer.style.marginTop = "8px";

    this.createModeCard(cardsContainer, "Manual", "Configure everything yourself", () =>
      this.navigateTo("manual-form")
    );

    this.createModeCard(cardsContainer, "AI Wizard", "Describe your idea, AI creates the agent", () =>
      this.navigateTo("wizard-input")
    );
  }

  private createModeCard(container: HTMLElement, title: string, description: string, onClick: () => void): void {
    const card = container.createDiv();
    card.style.flex = "1";
    card.style.padding = "20px";
    card.style.borderRadius = "8px";
    card.style.border = "1px solid var(--background-modifier-border)";
    card.style.cursor = "pointer";
    card.style.textAlign = "center";
    card.style.transition = "border-color 0.15s ease, background-color 0.15s ease";

    card.createEl("h3", { text: title }).style.margin = "0 0 8px 0";
    const desc = card.createEl("p", { text: description });
    desc.style.margin = "0";
    desc.style.color = "var(--text-muted)";
    desc.style.fontSize = "0.85em";

    card.addEventListener("mouseenter", () => {
      card.style.borderColor = "var(--interactive-accent)";
      card.style.backgroundColor = "var(--background-modifier-hover)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.borderColor = "var(--background-modifier-border)";
      card.style.backgroundColor = "";
    });
    card.addEventListener("click", onClick);
  }

  // ── Step: Wizard Input ────────────────────────────────────

  private renderWizardInput(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "AI Agent Wizard" });

    this.addWizardModelField(contentEl);

    new Setting(contentEl).setName("Describe your agent idea").addTextArea((textarea) => {
      textarea
        .setPlaceholder(
          "e.g., A coding assistant that specializes in TypeScript and React, helps with code reviews, and suggests best practices..."
        )
        .setValue(this.wizardIdea)
        .onChange((value) => {
          this.wizardIdea = value;
        });
      textarea.inputEl.style.width = "100%";
      textarea.inputEl.style.height = "150px";
    });

    this.addWizardButtons(contentEl);
  }

  private addWizardModelField(container: HTMLElement): void {
    let suggestionsEl: HTMLElement;

    new Setting(container)
      .setName("AI Model")
      .setDesc("Select which model generates the agent")
      .addText((text) => {
        text.setPlaceholder("Type to filter models...").onChange((value) => {
          this.wizardModel = value;
          this.updateModelSuggestions(value, suggestionsEl, true);
        });
        text.inputEl.style.width = "300px";

        if (this.wizardModel) {
          text.setValue(this.wizardModel);
        }

        this.modelInputEl = text.inputEl;
      });

    suggestionsEl = container.createDiv({ cls: "chatgpt-md-model-suggestions" });
    suggestionsEl.style.maxHeight = "150px";
    suggestionsEl.style.overflowY = "auto";
    suggestionsEl.style.marginTop = "-10px";
    suggestionsEl.style.marginBottom = "10px";
  }

  private addWizardButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "20px";

    const backBtn = buttonContainer.createEl("button", { text: "Back" });
    backBtn.onclick = () => this.navigateTo("mode-select");

    const createBtn = buttonContainer.createEl("button", {
      text: "Create with AI",
      cls: "mod-cta",
    });
    createBtn.onclick = () => this.handleWizardGenerate();
  }

  // ── Step: Wizard Loading ──────────────────────────────────

  private renderWizardLoading(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Creating your agent..." });

    const loadingContainer = contentEl.createDiv();
    loadingContainer.style.textAlign = "center";
    loadingContainer.style.padding = "40px 0";

    const spinner = loadingContainer.createDiv();
    spinner.style.display = "inline-block";
    spinner.style.width = "32px";
    spinner.style.height = "32px";
    spinner.style.border = "3px solid var(--background-modifier-border)";
    spinner.style.borderTop = "3px solid var(--interactive-accent)";
    spinner.style.borderRadius = "50%";
    spinner.style.animation = "chatgpt-md-spin 1s linear infinite";

    const desc = loadingContainer.createEl("p", {
      text: "AI is crafting your agent's configuration...",
    });
    desc.style.color = "var(--text-muted)";
    desc.style.marginTop = "16px";

    this.addSpinnerStyle();
  }

  private addSpinnerStyle(): void {
    if (document.getElementById("chatgpt-md-spinner-style")) return;
    const style = document.createElement("style");
    style.id = "chatgpt-md-spinner-style";
    style.textContent = `@keyframes chatgpt-md-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  // ── Step: Manual Form ─────────────────────────────────────

  private renderManualForm(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Create New Agent" });

    this.addNameField(contentEl);
    this.addModelField(contentEl);
    this.addTemperatureField(contentEl);
    this.addMessageField(contentEl);
    this.addManualButtons(contentEl);
  }

  private addNameField(container: HTMLElement): void {
    new Setting(container).setName("Agent Name").addText((text) => {
      text
        .setPlaceholder("My Agent")
        .setValue(this.name)
        .onChange((value) => {
          this.name = value;
        });
      text.inputEl.style.width = "300px";
    });
  }

  private addModelField(container: HTMLElement): void {
    new Setting(container).setName("Model").addText((text) => {
      text
        .setPlaceholder("Type to filter models...")
        .setValue(this.model)
        .onChange((value) => {
          this.model = value;
          this.updateModelSuggestions(value, suggestionsEl, false);
        });
      text.inputEl.style.width = "300px";

      this.modelInputEl = text.inputEl;
    });

    const suggestionsEl = container.createDiv({ cls: "chatgpt-md-model-suggestions" });
    suggestionsEl.style.maxHeight = "150px";
    suggestionsEl.style.overflowY = "auto";
    suggestionsEl.style.marginTop = "-10px";
    suggestionsEl.style.marginBottom = "10px";

    this.updateModelSuggestions("", suggestionsEl, false);
  }

  private updateModelSuggestions(query: string, suggestionsEl: HTMLElement, isWizard: boolean): void {
    suggestionsEl.empty();

    const filtered = this.availableModels.filter((m) => m.toLowerCase().includes(query.toLowerCase()));

    for (const model of filtered) {
      const item = suggestionsEl.createDiv({ cls: "suggestion-item" });
      item.setText(model);
      item.style.padding = "4px 8px";
      item.style.cursor = "pointer";
      item.style.borderRadius = "4px";
      item.addEventListener("mouseenter", () => (item.style.backgroundColor = "var(--background-modifier-hover)"));
      item.addEventListener("mouseleave", () => (item.style.backgroundColor = ""));
      item.addEventListener("click", () => {
        if (isWizard) {
          this.wizardModel = model;
        } else {
          this.model = model;
        }
        if (this.modelInputEl) {
          this.modelInputEl.value = model;
          this.modelInputEl.dispatchEvent(new Event("input"));
        }
        suggestionsEl.empty();
      });
    }
  }

  private addTemperatureField(container: HTMLElement): void {
    const tempDisplay = container.createEl("span", { text: this.temperature.toFixed(1) });
    tempDisplay.style.marginLeft = "8px";
    tempDisplay.style.fontFamily = "monospace";

    new Setting(container).setName("Temperature").addSlider((slider) => {
      slider
        .setLimits(0, 2, 0.1)
        .setValue(this.temperature)
        .onChange((value) => {
          this.temperature = value;
          tempDisplay.setText(value.toFixed(1));
        });
      slider.sliderEl.style.width = "250px";
      slider.sliderEl.addEventListener("input", () => {
        tempDisplay.setText(slider.getValue().toFixed(1));
      });
    });

    const settingItem = container.lastElementChild;
    const controlEl = settingItem?.querySelector(".setting-item-control");
    if (controlEl) {
      controlEl.appendChild(tempDisplay);
    }
  }

  private addMessageField(container: HTMLElement): void {
    new Setting(container).setName("Agent Message").addTextArea((textarea) => {
      textarea
        .setPlaceholder("Enter the agent's initial prompt or instructions...")
        .setValue(this.message)
        .onChange((value) => {
          this.message = value;
        });
      textarea.inputEl.style.width = "100%";
      textarea.inputEl.style.height = "200px";
    });
  }

  private addManualButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "20px";

    const backBtn = buttonContainer.createEl("button", { text: "Back" });
    backBtn.onclick = () => this.navigateTo(this.cameFromWizard ? "wizard-input" : "mode-select");

    const createBtn = buttonContainer.createEl("button", { text: "Create Agent", cls: "mod-cta" });
    createBtn.onclick = () => this.handleCreate();
  }

  // ── AI Generation ─────────────────────────────────────────

  private async handleWizardGenerate(): Promise<void> {
    if (!this.wizardModel.trim()) {
      new Notice("Please select a model");
      return;
    }
    if (!this.wizardIdea.trim()) {
      new Notice("Please describe your agent idea");
      return;
    }
    if (!this.services) {
      new Notice("AI services not available");
      return;
    }

    this.navigateTo("wizard-loading");

    try {
      const response = await this.callAiForAgentConfig();
      const parsed = this.parseWizardResponse(response);

      if (!parsed) {
        new Notice("Could not parse AI response. Please try again.");
        this.navigateTo("wizard-input");
        return;
      }

      this.name = parsed.name;
      this.temperature = Math.max(0, Math.min(2, parsed.temperature));
      this.message = parsed.prompt;
      this.model = this.wizardModel;
      this.cameFromWizard = true;

      this.navigateTo("manual-form");
    } catch (error) {
      console.error("[ChatGPT MD] AI wizard error:", error);
      new Notice(`AI wizard error: ${error instanceof Error ? error.message : String(error)}`);
      this.navigateTo("wizard-input");
    }
  }

  private async callAiForAgentConfig(): Promise<string> {
    const services = this.services!;
    const aiService = services.aiProviderService();
    const providerType = this.getProviderTypeFromModel(this.wizardModel);
    const apiKey = services.apiAuthService.getApiKey(this.settings, providerType);
    const urls = getDefaultApiUrls(this.settings);
    const url = urls[providerType] || "";

    const messages = [
      { role: "system", content: AGENT_WIZARD_SYSTEM_PROMPT },
      { role: "user", content: this.wizardIdea },
    ];

    const result = await aiService.callAiAPI(
      messages,
      { model: this.wizardModel, stream: false, temperature: 0.7 },
      "",
      url,
      undefined,
      false,
      apiKey,
      this.settings
    );

    return result.fullString;
  }

  private getProviderTypeFromModel(model: string): string {
    const prefixes = ["ollama", "openrouter", "lmstudio", "anthropic", "gemini", "zai"];
    for (const prefix of prefixes) {
      if (model.startsWith(`${prefix}@`)) {
        return prefix;
      }
    }
    return "openai";
  }

  private parseWizardResponse(response: string): { name: string; temperature: number; prompt: string } | null {
    const cleaned = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (
        typeof parsed.name === "string" &&
        typeof parsed.temperature === "number" &&
        typeof parsed.prompt === "string"
      ) {
        return { name: parsed.name, temperature: parsed.temperature, prompt: parsed.prompt };
      }
    } catch {
      // Try to extract JSON from within the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (
            typeof parsed.name === "string" &&
            typeof parsed.temperature === "number" &&
            typeof parsed.prompt === "string"
          ) {
            return { name: parsed.name, temperature: parsed.temperature, prompt: parsed.prompt };
          }
        } catch {
          /* fallthrough */
        }
      }
    }
    return null;
  }

  // ── Agent Creation ────────────────────────────────────────

  private async handleCreate(): Promise<void> {
    if (!this.name.trim()) {
      new Notice("Please enter an agent name");
      return;
    }
    if (!this.model.trim()) {
      new Notice("Please select or enter a model");
      return;
    }

    try {
      await this.agentService.createAgentFile(this.name, this.model, this.temperature, this.message, this.settings);

      new Notice(`Agent "${this.name}" created`);
      this.close();
    } catch (error) {
      console.error("[ChatGPT MD] Error creating agent:", error);
      new Notice(`[ChatGPT MD] Error creating agent: ${(error as Error).message}`);
    }
  }
}
