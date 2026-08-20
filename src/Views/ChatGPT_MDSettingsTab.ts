import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiAuthService, isValidApiKey, isValidSecretId } from "src/Services/ApiAuthService";
import { CredentialDefinition, getCredentialDefinitions } from "src/Services/Providers/ProviderRegistry";
import { COLLAPSIBLE_GROUPS, createSettingsSchema, SettingDefinition } from "./settingsSchema";

interface SettingsProvider {
  settings: ChatGPT_MDSettings;
  updateSettings: (settings: Partial<ChatGPT_MDSettings>) => void;
  saveSettings: () => Promise<void>;
  retryCredentialMigration: () => Promise<unknown>;
  deleteInsecureCredentialCopy: (definition: CredentialDefinition) => Promise<boolean>;
  apiAuthService: ApiAuthService;
}

const NUMERIC_RANGES: Partial<Record<keyof ChatGPT_MDSettings, { min: number; max: number }>> = {
  headingLevel: { min: 0, max: 6 },
  maxWebSearchResults: { min: 1, max: 10 },
  openaiDefaultTemperature: { min: 0, max: 2 },
  anthropicDefaultTemperature: { min: 0, max: 1 },
  geminiDefaultTemperature: { min: 0, max: 2 },
  openrouterDefaultTemperature: { min: 0, max: 2 },
  zaiDefaultTemperature: { min: 0, max: 1 },
  ollamaDefaultTemperature: { min: 0, max: 2 },
  lmstudioDefaultTemperature: { min: 0, max: 2 },
  openaiDefaultTopP: { min: 0, max: 1 },
  geminiDefaultTopP: { min: 0, max: 1 },
  openrouterDefaultTopP: { min: 0, max: 1 },
  ollamaDefaultTopP: { min: 0, max: 1 },
  lmstudioDefaultTopP: { min: 0, max: 1 },
  openaiDefaultPresencePenalty: { min: -2, max: 2 },
  openaiDefaultFrequencyPenalty: { min: -2, max: 2 },
  openrouterDefaultPresencePenalty: { min: -2, max: 2 },
  openrouterDefaultFrequencyPenalty: { min: -2, max: 2 },
  lmstudioDefaultPresencePenalty: { min: -2, max: 2 },
  lmstudioDefaultFrequencyPenalty: { min: -2, max: 2 },
  knowledgeBatchSize: { min: 1, max: 16 },
  knowledgeAutoRouteConfidence: { min: 0, max: 1 },
  knowledgeReviewConfidence: { min: 0, max: 1 },
  knowledgeMaxCharsPerChunk: { min: 1000, max: 200000 },
  knowledgeMinConversationChars: { min: 0, max: 100000 },
  knowledgeWatchIntervalSeconds: { min: 30, max: 3600 },
};

export function parseSettingValue(schema: SettingDefinition, value: string | boolean): string | number | boolean {
  if (schema.valueType !== "number") return value;

  const parsedValue = typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  const range = NUMERIC_RANGES[schema.id];
  const outsideRange = range && (parsedValue < range.min || parsedValue > range.max);

  if (!Number.isFinite(parsedValue) || outsideRange) {
    const rangeDescription = range ? ` between ${range.min} and ${range.max}` : "";
    throw new Error(`${schema.name} must be a valid number${rangeDescription}.`);
  }

  return parsedValue;
}

export class ChatGPT_MDSettingsTab extends PluginSettingTab {
  settingsProvider: SettingsProvider;
  private displayInProgress = false;

  constructor(app: App, plugin: Plugin, settingsProvider: SettingsProvider) {
    super(app, plugin);
    this.settingsProvider = settingsProvider;
  }

  /**
   * Type-safe helper method to update settings
   */
  private updateSetting<K extends keyof ChatGPT_MDSettings>(key: K, value: ChatGPT_MDSettings[K]): void {
    this.settingsProvider.updateSettings({ [key]: value });
  }

  display(): void {
    void this.displayAfterMigration();
  }

  private async displayAfterMigration(): Promise<void> {
    if (this.displayInProgress) return;
    this.displayInProgress = true;
    try {
      await this.settingsProvider.retryCredentialMigration();
    } catch {
      new Notice("Some credentials could not be migrated. They remain available and will be retried.");
    }

    try {
      this.renderSettings();
    } finally {
      this.displayInProgress = false;
    }
  }

  private renderSettings(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settingsSchema = createSettingsSchema(this.settingsProvider.settings);
    const { regularGroups, collapsibleGroups } = this.groupSettings(settingsSchema);
    this.renderPriorityGroups(containerEl, regularGroups);
    this.renderProviderGroups(containerEl, collapsibleGroups);
    this.renderRemainingGroups(containerEl, regularGroups);
  }

  private groupSettings(settingsSchema: SettingDefinition[]): {
    regularGroups: Record<string, SettingDefinition[]>;
    collapsibleGroups: Record<string, SettingDefinition[]>;
  } {
    return settingsSchema.reduce(
      (groups, setting) => {
        const target = COLLAPSIBLE_GROUPS.includes(setting.group) ? groups.collapsibleGroups : groups.regularGroups;
        target[setting.group] = [...(target[setting.group] || []), setting];
        return groups;
      },
      { regularGroups: {}, collapsibleGroups: {} } as {
        regularGroups: Record<string, SettingDefinition[]>;
        collapsibleGroups: Record<string, SettingDefinition[]>;
      }
    );
  }

  private renderPriorityGroups(container: HTMLElement, regularGroups: Record<string, SettingDefinition[]>): void {
    this.renderRegularGroup(container, regularGroups, "API Keys");
    this.renderRegularGroup(container, regularGroups, "Chat Behavior");
  }

  private renderRegularGroup(
    container: HTMLElement,
    regularGroups: Record<string, SettingDefinition[]>,
    group: string
  ): void {
    const settings = regularGroups[group];
    if (!settings) return;

    this.renderGroupHeader(container, group);
    settings.forEach((setting) => this.createSettingElement(container, setting));
    container.createEl("hr");
    delete regularGroups[group];
  }

  private renderProviderGroups(container: HTMLElement, collapsibleGroups: Record<string, SettingDefinition[]>): void {
    if (Object.keys(collapsibleGroups).length === 0) return;

    this.renderGroupHeader(container, "Provider Settings");
    const providerNote = container.createEl("p", {
      text: "Configure default settings for each AI provider. Click to expand.",
      cls: "setting-item-description",
    });
    providerNote.style.marginTop = "-10px";
    providerNote.style.marginBottom = "15px";

    Object.entries(collapsibleGroups).forEach(([group, settings]) => {
      this.renderCollapsibleGroup(container, group, settings);
    });
    container.createEl("hr");
  }

  private renderRemainingGroups(container: HTMLElement, regularGroups: Record<string, SettingDefinition[]>): void {
    Object.keys(regularGroups).forEach((group) => this.renderRegularGroup(container, regularGroups, group));
  }

  /**
   * Render a group header (h3)
   */
  private renderGroupHeader(container: HTMLElement, title: string): void {
    container.createEl("h3", { text: title });
  }

  /**
   * Render a collapsible group using details/summary elements
   */
  private renderCollapsibleGroup(container: HTMLElement, group: string, settings: SettingDefinition[]): void {
    const details = container.createEl("details", { cls: "chatgpt-md-collapsible-group" });
    details.style.marginBottom = "10px";
    details.style.border = "1px solid var(--background-modifier-border)";
    details.style.borderRadius = "5px";
    details.style.padding = "0";

    const summary = details.createEl("summary", { text: group });
    summary.style.padding = "10px 15px";
    summary.style.cursor = "pointer";
    summary.style.fontWeight = "600";
    summary.style.backgroundColor = "var(--background-secondary)";
    summary.style.borderRadius = "5px";
    summary.style.userSelect = "none";

    const content = details.createEl("div", { cls: "chatgpt-md-collapsible-content" });
    content.style.padding = "10px 15px";

    settings.forEach((setting) => {
      this.createSettingElement(content, setting);
    });
  }

  createSettingElement(container: HTMLElement, schema: SettingDefinition): void {
    const setting = new Setting(container).setName(schema.name).setDesc(schema.description);

    if (schema.type === "text") this.addTextSetting(setting, schema);
    if (schema.type === "credential") this.addCredentialSetting(setting, schema);
    if (schema.type === "textarea") this.addTextareaSetting(setting, schema);
    if (schema.type === "toggle") this.addToggleSetting(setting, schema);
    if (schema.type === "dropdown" && schema.options) this.addDropdownSetting(setting, schema);
  }

  private addCredentialSetting(setting: Setting, schema: SettingDefinition): void {
    const SecretControl = this.settingsProvider.apiAuthService.getSecretComponentConstructor();
    if (!SecretControl || !schema.secretIdSetting) {
      this.addTextSetting(setting, schema);
      return;
    }

    const persistedReference = this.settingsProvider.settings[schema.secretIdSetting];
    const control = new SecretControl(this.app, setting.controlEl);
    control.setValue(isValidSecretId(persistedReference) ? persistedReference : "");
    control.onChange((value: unknown) => {
      void this.saveSecretReference(schema.secretIdSetting!, value, schema.name);
    });

    const definition = getCredentialDefinitions().find((item) => item.legacySetting === schema.id);
    if (definition) this.addInsecureCopyAction(setting, definition);
  }

  private addInsecureCopyAction(setting: Setting, definition: CredentialDefinition): void {
    const legacy = this.settingsProvider.settings[definition.legacySetting];
    if (
      !isValidApiKey(legacy) ||
      !this.settingsProvider.apiAuthService.hasValidReference(this.settingsProvider.settings, definition)
    ) {
      return;
    }

    setting.setDesc(
      `${definition.label} has an insecure plaintext copy in plugin data. The secure credential is already authoritative.`
    );
    setting.addButton((button) =>
      button
        .setButtonText("Delete insecure copy")
        .setWarning()
        .onClick(async () => {
          if (!window.confirm(`Delete the insecure ${definition.label} plaintext copy?`)) return;
          try {
            if (await this.settingsProvider.deleteInsecureCredentialCopy(definition)) this.display();
          } catch {
            new Notice("The insecure copy could not be deleted and was retained.");
          }
        })
    );
  }

  private async saveSecretReference(key: keyof ChatGPT_MDSettings, value: unknown, label: string): Promise<void> {
    if (value !== "" && !isValidSecretId(value)) {
      new Notice(`Invalid credential selection for ${label}`);
      return;
    }

    const previous = this.settingsProvider.settings[key];
    this.updateSetting(key, value as ChatGPT_MDSettings[typeof key]);
    try {
      await this.settingsProvider.saveSettings();
    } catch {
      this.updateSetting(key, previous as ChatGPT_MDSettings[typeof key]);
      new Notice(`Could not save credential selection for ${label}`);
    }
  }

  private addTextSetting(setting: Setting, schema: SettingDefinition): void {
    setting.addText((text) => {
      text
        .setPlaceholder(schema.placeholder || "")
        .setValue(String(this.settingsProvider.settings[schema.id]))
        .onChange((value) => this.saveSetting(schema, value));
      text.inputEl.style.width = "300px";
      return text;
    });
  }

  private addTextareaSetting(setting: Setting, schema: SettingDefinition): void {
    setting.addTextArea((text) => {
      text
        .setPlaceholder(schema.placeholder || "")
        .setValue(String(this.settingsProvider.settings[schema.id] || schema.placeholder))
        .onChange((value) => this.saveSetting(schema, value));
      text.inputEl.style.width = "300px";
      this.applyTextareaHeight(text.inputEl, schema);
      return text;
    });
  }

  private addToggleSetting(setting: Setting, schema: SettingDefinition): void {
    setting.addToggle((toggle) =>
      toggle
        .setValue(Boolean(this.settingsProvider.settings[schema.id]))
        .onChange((value) => this.saveSetting(schema, value))
    );
  }

  private addDropdownSetting(setting: Setting, schema: SettingDefinition): void {
    setting.addDropdown((dropdown) => {
      dropdown.addOptions(schema.options || {});
      dropdown.setValue(String(this.settingsProvider.settings[schema.id]));
      dropdown.onChange((value) => this.saveSetting(schema, value));
      dropdown.selectEl.style.width = "300px";
      return dropdown;
    });
  }

  private applyTextareaHeight(inputEl: HTMLTextAreaElement, schema: SettingDefinition): void {
    if (schema.id === "defaultChatFrontmatter" || schema.id === "pluginSystemMessage") {
      inputEl.style.height = "260px";
      inputEl.style.minHeight = "260px";
    }

    if (schema.id === "toolEnabledModels") {
      inputEl.style.height = "200px";
      inputEl.style.minHeight = "200px";
    }
  }

  private async saveSetting(schema: SettingDefinition, value: string | boolean): Promise<void> {
    try {
      const parsedValue = parseSettingValue(schema, value);
      this.updateSetting(schema.id, parsedValue as ChatGPT_MDSettings[typeof schema.id]);
      await this.settingsProvider.saveSettings();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : `Invalid value for ${schema.name}`);
    }
  }
}
