import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_DATE_FORMAT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
  DEFAULT_ZAI_CONFIG,
} from "src/Services/DefaultConfigs";

interface SettingDefinition {
  id: keyof ChatGPT_MDSettings;
  name: string;
  description: string;
  type: "text" | "textarea" | "toggle" | "dropdown";
  placeholder?: string;
  options?: Record<string, string>;
  group: string;
}

interface SettingsProvider {
  settings: ChatGPT_MDSettings;
  saveSettings: () => Promise<void>;
}

// Groups that should be collapsible (provider-specific settings)
const COLLAPSIBLE_GROUPS = [
  "OpenAI",
  "Anthropic",
  "Gemini",
  "OpenRouter",
  "Z.AI",
  "Ollama (Local)",
  "LM Studio (Local)",
];

export class ChatGPT_MDSettingsTab extends PluginSettingTab {
  settingsProvider: SettingsProvider;

  constructor(app: App, plugin: Plugin, settingsProvider: SettingsProvider) {
    super(app, plugin);
    this.settingsProvider = settingsProvider;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Define settings schema
    const settingsSchema: SettingDefinition[] = [
      // API Keys
      {
        id: "apiKey",
        name: "OpenAI API Key",
        description: "API Key for OpenAI",
        type: "text",
        placeholder: "your openAI API Key",
        group: "API Keys",
      },
      {
        id: "openrouterApiKey",
        name: "OpenRouter.ai API Key",
        description: "API Key for OpenRouter.ai",
        type: "text",
        placeholder: "your openRouter API Key",
        group: "API Keys",
      },
      {
        id: "anthropicApiKey",
        name: "Anthropic API Key",
        description: "API Key for Anthropic (Claude)",
        type: "text",
        placeholder: "your Anthropic API Key",
        group: "API Keys",
      },
      {
        id: "geminiApiKey",
        name: "Gemini API Key",
        description: "API Key for Google Gemini (Google AI Studio)",
        type: "text",
        placeholder: "your Gemini API Key",
        group: "API Keys",
      },
      {
        id: "zaiApiKey",
        name: "Z.AI API Key",
        description:
          "API Key for Z.AI (GLM models). Works with both Standard API and Coding Plan. Get your key at https://z.ai",
        type: "text",
        placeholder: "your Z.AI API Key",
        group: "API Keys",
      },

      // Chat Behavior
      {
        id: "defaultChatFrontmatter",
        name: "Default Chat Frontmatter",
        description:
          "Default frontmatter for new chat files. You can change/use all of the settings exposed by the OpenAI API here: https://platform.openai.com/docs/api-reference/chat/create",
        type: "textarea",
        placeholder: this.settingsProvider.settings.defaultChatFrontmatter,
        group: "Chat Behavior",
      },
      {
        id: "pluginSystemMessage",
        name: "Plugin System Message",
        description:
          "System message that provides context about the Obsidian/ChatGPT MD plugin environment. This helps the AI understand it's working within Obsidian and format responses appropriately.",
        type: "textarea",
        group: "Chat Behavior",
      },
      {
        id: "stream",
        name: "Stream",
        description: "Stream responses from OpenAI",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "generateAtCursor",
        name: "Generate at Cursor",
        description: "Generate text at cursor instead of end of file",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "autoInferTitle",
        name: "Automatically Infer Title",
        description: "Automatically infer title after 4 messages have been exchanged",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "inferTitleLanguage",
        name: "Infer Title Language",
        description: "Language to use for title inference.",
        type: "dropdown",
        options: {
          English: "English",
          Japanese: "Japanese",
          Spanish: "Spanish",
          French: "French",
          German: "German",
          Chinese: "Chinese",
          Korean: "Korean",
          Italian: "Italian",
          Russian: "Russian",
        },
        group: "Chat Behavior",
      },

      // OpenAI Defaults
      {
        id: "openaiUrl",
        name: "API URL",
        description: `URL for OpenAI API\nDefault URL: ${DEFAULT_OPENAI_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OPENAI_CONFIG.url,
        group: "OpenAI",
      },
      {
        id: "openaiDefaultModel",
        name: "Default Model",
        description: "Default model for OpenAI chats",
        type: "text",
        placeholder: "openai@gpt-4",
        group: "OpenAI",
      },
      {
        id: "openaiDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for OpenAI chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "OpenAI",
      },
      {
        id: "openaiDefaultMaxTokens",
        name: "Default Max Tokens",
        description: "Default max tokens for OpenAI chats",
        type: "text",
        placeholder: "400",
        group: "OpenAI",
      },

      // Anthropic Defaults
      {
        id: "anthropicUrl",
        name: "API URL",
        description: `URL for Anthropic API\nDefault URL: ${DEFAULT_ANTHROPIC_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_ANTHROPIC_CONFIG.url,
        group: "Anthropic",
      },
      {
        id: "anthropicDefaultModel",
        name: "Default Model",
        description: "Default model for Anthropic chats",
        type: "text",
        placeholder: "anthropic@claude-3-5-sonnet-20241022",
        group: "Anthropic",
      },
      {
        id: "anthropicDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for Anthropic chats (0.0 to 1.0)",
        type: "text",
        placeholder: "0.7",
        group: "Anthropic",
      },
      {
        id: "anthropicDefaultMaxTokens",
        name: "Default Max Tokens",
        description: "Default max tokens for Anthropic chats",
        type: "text",
        placeholder: "400",
        group: "Anthropic",
      },

      // Gemini Defaults
      {
        id: "geminiUrl",
        name: "API URL",
        description: `URL for Gemini API\nDefault URL: ${DEFAULT_GEMINI_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_GEMINI_CONFIG.url,
        group: "Gemini",
      },
      {
        id: "geminiDefaultModel",
        name: "Default Model",
        description: "Default model for Gemini chats",
        type: "text",
        placeholder: "gemini@gemini-1.5-pro",
        group: "Gemini",
      },
      {
        id: "geminiDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for Gemini chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "Gemini",
      },
      {
        id: "geminiDefaultMaxTokens",
        name: "Default Max Tokens",
        description: "Default max tokens for Gemini chats",
        type: "text",
        placeholder: "400",
        group: "Gemini",
      },

      // OpenRouter Defaults
      {
        id: "openrouterUrl",
        name: "API URL",
        description: `URL for OpenRouter.ai API\nDefault URL: ${DEFAULT_OPENROUTER_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OPENROUTER_CONFIG.url,
        group: "OpenRouter",
      },
      {
        id: "openrouterDefaultModel",
        name: "Default Model",
        description: "Default model for OpenRouter chats",
        type: "text",
        placeholder: "openrouter@anthropic/claude-3.5-sonnet",
        group: "OpenRouter",
      },
      {
        id: "openrouterDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for OpenRouter chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "OpenRouter",
      },
      {
        id: "openrouterDefaultMaxTokens",
        name: "Default Max Tokens",
        description: "Default max tokens for OpenRouter chats",
        type: "text",
        placeholder: "400",
        group: "OpenRouter",
      },

      // Z.AI Defaults
      {
        id: "zaiUrl",
        name: "API URL",
        description: `URL for Z.AI API. Two modes available:\n• Standard API (pay-per-token): https://api.z.ai/api/paas/v4\n• Coding Plan (subscription): https://api.z.ai/api/anthropic\n\nDefault: https://api.z.ai (uses Standard API mode)`,
        type: "text",
        placeholder: DEFAULT_ZAI_CONFIG.url,
        group: "Z.AI",
      },
      {
        id: "zaiDefaultModel",
        name: "Default Model",
        description: "Default model for Z.AI chats (e.g., zai@glm-4.7)",
        type: "text",
        placeholder: DEFAULT_ZAI_CONFIG.model,
        group: "Z.AI",
      },
      {
        id: "zaiDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for Z.AI chats (0.0 to 1.0)",
        type: "text",
        placeholder: "0.7",
        group: "Z.AI",
      },
      {
        id: "zaiDefaultMaxTokens",
        name: "Default Max Tokens",
        description: "Default max tokens for Z.AI chats",
        type: "text",
        placeholder: "400",
        group: "Z.AI",
      },

      // Ollama Defaults (Local)
      {
        id: "ollamaUrl",
        name: "API URL",
        description: `URL for Ollama API\nDefault URL: ${DEFAULT_OLLAMA_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OLLAMA_CONFIG.url,
        group: "Ollama (Local)",
      },
      {
        id: "ollamaDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for Ollama chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "Ollama (Local)",
      },

      // LM Studio Defaults (Local)
      {
        id: "lmstudioUrl",
        name: "API URL",
        description: `URL for LM Studio API\nDefault URL: ${DEFAULT_LMSTUDIO_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_LMSTUDIO_CONFIG.url,
        group: "LM Studio (Local)",
      },
      {
        id: "lmstudioDefaultTemperature",
        name: "Default Temperature",
        description: "Default temperature for LM Studio chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "LM Studio (Local)",
      },

      // Folders
      {
        id: "chatFolder",
        name: "Chat Folder",
        description: "Path to folder for chat files",
        type: "text",
        group: "Folders",
      },
      {
        id: "chatTemplateFolder",
        name: "Chat Template Folder",
        description: "Path to folder for chat file templates",
        type: "text",
        placeholder: "chat-templates",
        group: "Folders",
      },

      // Formatting
      {
        id: "dateFormat",
        name: "Date Format",
        description: "Date format for chat files. Valid date blocks are: YYYY, MM, DD, hh, mm, ss",
        type: "text",
        placeholder: DEFAULT_DATE_FORMAT,
        group: "Formatting",
      },
      {
        id: "headingLevel",
        name: "Heading Level",
        description: `Heading level for messages (example for heading level 2: '## ${ROLE_IDENTIFIER}${ROLE_USER}'). Valid heading levels are 0, 1, 2, 3, 4, 5, 6`,
        type: "text",
        group: "Formatting",
      },

      // Tool Calling
      {
        id: "enableToolCalling",
        name: "Enable AI Tool Calling (Experimental, read only)",
        description:
          "Privacy Focus: All tool calls require your explicit approval before the LLM sees the data. " +
          "Allow the AI to use tools: Search files, Read file contents, Web Search (Privacy focused Brave Search API). ",
        type: "toggle",
        group: "Tool Calling",
      },
      {
        id: "toolEnabledModels",
        name: "Tool-Enabled Models",
        description:
          "Models allowed to use tools (vault search, file read, web search).\n\n" +
          "Format: One model pattern per line. Supports wildcards (*).\n" +
          "Examples: 'gpt-4o', 'claude-*', 'gemini-1.5*'\n\n" +
          "Only tested models are included by default.",
        type: "textarea",
        placeholder: "gpt-5.2\ngpt-5.2-chat-latest\no3\nclaude-opus-4-5",
        group: "Tool Calling",
      },

      // Web Search configuration
      {
        id: "webSearchApiKey",
        name: "Brave Search API Key",
        description: "API key for Brave Search.",
        type: "text",
        placeholder: "your Brave Search API key",
        group: "Tool Calling",
      },
      {
        id: "webSearchProvider",
        name: "Alternative Search Provider",
        description: "Use a custom search API endpoint instead of Brave Search",
        type: "dropdown",
        options: {
          brave: "Brave Search (Default)",
          custom: "Custom API Endpoint",
        },
        group: "Tool Calling",
      },
      {
        id: "webSearchApiUrl",
        name: "Custom Search API URL",
        description: "URL for custom search API endpoint (only when using Custom provider)",
        type: "text",
        placeholder: "https://your-search-api.com/search",
        group: "Tool Calling",
      },
      {
        id: "maxWebSearchResults",
        name: "Max Web Search Results",
        description: "Maximum number of search results to return (1-10)",
        type: "text",
        placeholder: "5",
        group: "Tool Calling",
      },
      {
        id: "debugMode",
        name: "Debug Mode",
        description: "Enable detailed logging for debugging tool operations. Messages will appear in the console.",
        type: "toggle",
        group: "Tool Calling",
      },
    ];

    // Group settings by category
    const groupedSettings: Record<string, SettingDefinition[]> = {};
    settingsSchema.forEach((setting) => {
      if (!groupedSettings[setting.group]) {
        groupedSettings[setting.group] = [];
      }
      groupedSettings[setting.group].push(setting);
    });

    // Separate collapsible and non-collapsible groups
    const collapsibleGroups: Record<string, SettingDefinition[]> = {};
    const regularGroups: Record<string, SettingDefinition[]> = {};

    Object.entries(groupedSettings).forEach(([group, settings]) => {
      if (COLLAPSIBLE_GROUPS.includes(group)) {
        collapsibleGroups[group] = settings;
      } else {
        regularGroups[group] = settings;
      }
    });

    // Render API Keys first (always visible)
    if (regularGroups["API Keys"]) {
      this.renderGroupHeader(containerEl, "API Keys");
      regularGroups["API Keys"].forEach((setting) => {
        this.createSettingElement(containerEl, setting);
      });
      containerEl.createEl("hr");
      delete regularGroups["API Keys"];
    }

    // Render Chat Behavior (always visible)
    if (regularGroups["Chat Behavior"]) {
      this.renderGroupHeader(containerEl, "Chat Behavior");
      regularGroups["Chat Behavior"].forEach((setting) => {
        this.createSettingElement(containerEl, setting);
      });
      containerEl.createEl("hr");
      delete regularGroups["Chat Behavior"];
    }

    // Render collapsible provider settings section
    if (Object.keys(collapsibleGroups).length > 0) {
      this.renderGroupHeader(containerEl, "Provider Settings");
      const providerNote = containerEl.createEl("p", {
        text: "Configure default settings for each AI provider. Click to expand.",
        cls: "setting-item-description",
      });
      providerNote.style.marginTop = "-10px";
      providerNote.style.marginBottom = "15px";

      // Create collapsible sections for each provider
      Object.entries(collapsibleGroups).forEach(([group, settings]) => {
        this.renderCollapsibleGroup(containerEl, group, settings);
      });

      containerEl.createEl("hr");
    }

    // Render remaining regular groups
    Object.entries(regularGroups).forEach(([group, settings]) => {
      this.renderGroupHeader(containerEl, group);
      settings.forEach((setting) => {
        this.createSettingElement(containerEl, setting);
      });
      containerEl.createEl("hr");
    });
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

  createSettingElement(container: HTMLElement, schema: SettingDefinition) {
    // Regular handling for all settings
    const setting = new Setting(container).setName(schema.name).setDesc(schema.description);

    if (schema.type === "text") {
      setting.addText((text) => {
        text
          .setPlaceholder(schema.placeholder || "")
          .setValue(String(this.settingsProvider.settings[schema.id]))
          .onChange(async (value) => {
            (this.settingsProvider.settings[schema.id] as string) = value;
            await this.settingsProvider.saveSettings();
          });

        // Set width to match textarea
        text.inputEl.style.width = "300px";

        return text;
      });
    } else if (schema.type === "textarea") {
      setting.addTextArea((text) => {
        text
          .setPlaceholder(schema.placeholder || "")
          .setValue(String(this.settingsProvider.settings[schema.id] || schema.placeholder))
          .onChange(async (value) => {
            (this.settingsProvider.settings[schema.id] as string) = value;
            await this.settingsProvider.saveSettings();
          });

        text.inputEl.style.width = "300px";

        if (schema.id === "defaultChatFrontmatter" || schema.id === "pluginSystemMessage") {
          text.inputEl.style.height = "260px";
          text.inputEl.style.minHeight = "260px";
        }

        if (schema.id === "toolEnabledModels") {
          text.inputEl.style.height = "200px";
          text.inputEl.style.minHeight = "200px";
        }

        return text;
      });
    } else if (schema.type === "toggle") {
      setting.addToggle((toggle) =>
        toggle.setValue(Boolean(this.settingsProvider.settings[schema.id])).onChange(async (value) => {
          (this.settingsProvider.settings[schema.id] as boolean) = value;
          await this.settingsProvider.saveSettings();
        })
      );
    } else if (schema.type === "dropdown" && schema.options) {
      setting.addDropdown((dropdown) => {
        dropdown.addOptions(schema.options || {});
        dropdown.setValue(String(this.settingsProvider.settings[schema.id]));
        dropdown.onChange(async (value) => {
          (this.settingsProvider.settings[schema.id] as string) = value;
          await this.settingsProvider.saveSettings();
        });

        // Set width to match textarea
        dropdown.selectEl.style.width = "300px";

        return dropdown;
      });
    }
  }
}
