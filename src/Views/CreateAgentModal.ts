import { App, Modal, Notice, Setting } from "obsidian";
import { AgentService } from "src/Services/AgentService";
import { ChatGPT_MDSettings } from "src/Models/Config";

/**
 * Modal for creating a new agent with a form
 */
export class CreateAgentModal extends Modal {
  private name = "";
  private model = "";
  private temperature = 0.7;
  private message = "";
  private modelInputEl?: HTMLInputElement;

  constructor(
    app: App,
    private agentService: AgentService,
    private settings: ChatGPT_MDSettings,
    private availableModels: string[]
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Create New Agent" });

    this.addNameField(contentEl);
    this.addModelField(contentEl);
    this.addTemperatureField(contentEl);
    this.addMessageField(contentEl);
    this.addButtons(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addNameField(container: HTMLElement): void {
    new Setting(container).setName("Agent Name").addText((text) => {
      text.setPlaceholder("My Agent").onChange((value) => {
        this.name = value;
      });
      text.inputEl.style.width = "300px";
    });
  }

  private addModelField(container: HTMLElement): void {
    new Setting(container).setName("Model").addText((text) => {
      text.setPlaceholder("Type to filter models...").onChange((value) => {
        this.model = value;
        this.updateModelSuggestions(value, suggestionsEl);
      });
      text.inputEl.style.width = "300px";

      // Pre-fill with first model if available
      if (this.availableModels.length > 0) {
        this.model = this.availableModels[0];
        text.setValue(this.model);
      }

      this.modelInputEl = text.inputEl;
    });

    const suggestionsEl = container.createDiv({ cls: "chatgpt-md-model-suggestions" });
    suggestionsEl.style.maxHeight = "150px";
    suggestionsEl.style.overflowY = "auto";
    suggestionsEl.style.marginTop = "-10px";
    suggestionsEl.style.marginBottom = "10px";

    this.updateModelSuggestions("", suggestionsEl);
  }

  private updateModelSuggestions(query: string, suggestionsEl: HTMLElement): void {
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
        this.model = model;
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

    // Move the display element into the setting control area
    const settingItem = container.lastElementChild;
    const controlEl = settingItem?.querySelector(".setting-item-control");
    if (controlEl) {
      controlEl.appendChild(tempDisplay);
    }
  }

  private addMessageField(container: HTMLElement): void {
    new Setting(container).setName("Agent Message").addTextArea((textarea) => {
      textarea.setPlaceholder("Enter the agent's initial prompt or instructions...").onChange((value) => {
        this.message = value;
      });
      textarea.inputEl.style.width = "100%";
      textarea.inputEl.style.height = "200px";
    });
  }

  private addButtons(container: HTMLElement): void {
    const buttonContainer = container.createDiv();
    buttonContainer.style.display = "flex";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "20px";

    const createBtn = buttonContainer.createEl("button", { text: "Create Agent", cls: "mod-cta" });
    createBtn.onclick = () => this.handleCreate();
  }

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
      new Notice(`[ChatGPT MD] Error creating agent: ${error.message}`);
    }
  }
}
