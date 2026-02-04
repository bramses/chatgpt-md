import { App, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_DATE_FORMAT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import {
  DEFAULT_ANTHROPIC_CONFIG,
  DEFAULT_COPILOT_CONFIG,
  DEFAULT_GEMINI_CONFIG,
  DEFAULT_LMSTUDIO_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_OPENROUTER_CONFIG,
  DEFAULT_ZAI_CONFIG,
} from "src/Services/DefaultConfigs";
import { ZAI_ANTHROPIC_ENDPOINT, ZAI_OPENAI_ENDPOINT } from "src/Services/Adapters/ZaiAdapter";
import { getDefaultToolWhitelist } from "src/Services/ToolSupportDetector";

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
        description: "API Key for Z.AI (GLM models). Works with both Standard API and Coding Plan. Get your key at https://z.ai",
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
        name: "OpenAI API URL",
        description: `URL for OpenAI API\nDefault URL: ${DEFAULT_OPENAI_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OPENAI_CONFIG.url,
        group: "OpenAI Defaults",
      },
      {
        id: "openaiDefaultModel",
        name: "Default OpenAI Model",
        description: "Default model for OpenAI chats",
        type: "text",
        placeholder: "openai@gpt-4",
        group: "OpenAI Defaults",
      },
      {
        id: "openaiDefaultTemperature",
        name: "Default OpenAI Temperature",
        description: "Default temperature for OpenAI chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "OpenAI Defaults",
      },
      {
        id: "openaiDefaultMaxTokens",
        name: "Default OpenAI Max Tokens",
        description: "Default max tokens for OpenAI chats",
        type: "text",
        placeholder: "400",
        group: "OpenAI Defaults",
      },

      // Anthropic Defaults
      {
        id: "anthropicUrl",
        name: "Anthropic API URL",
        description: `URL for Anthropic API\nDefault URL: ${DEFAULT_ANTHROPIC_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_ANTHROPIC_CONFIG.url,
        group: "Anthropic Defaults",
      },
      {
        id: "anthropicDefaultModel",
        name: "Default Anthropic Model",
        description: "Default model for Anthropic chats",
        type: "text",
        placeholder: "anthropic@claude-3-5-sonnet-20241022",
        group: "Anthropic Defaults",
      },
      {
        id: "anthropicDefaultTemperature",
        name: "Default Anthropic Temperature",
        description: "Default temperature for Anthropic chats (0.0 to 1.0)",
        type: "text",
        placeholder: "0.7",
        group: "Anthropic Defaults",
      },
      {
        id: "anthropicDefaultMaxTokens",
        name: "Default Anthropic Max Tokens",
        description: "Default max tokens for Anthropic chats",
        type: "text",
        placeholder: "400",
        group: "Anthropic Defaults",
      },

      // Gemini Defaults
      {
        id: "geminiUrl",
        name: "Gemini API URL",
        description: `URL for Gemini API\nDefault URL: ${DEFAULT_GEMINI_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_GEMINI_CONFIG.url,
        group: "Gemini Defaults",
      },
      {
        id: "geminiDefaultModel",
        name: "Default Gemini Model",
        description: "Default model for Gemini chats",
        type: "text",
        placeholder: "gemini@gemini-1.5-pro",
        group: "Gemini Defaults",
      },
      {
        id: "geminiDefaultTemperature",
        name: "Default Gemini Temperature",
        description: "Default temperature for Gemini chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "Gemini Defaults",
      },
      {
        id: "geminiDefaultMaxTokens",
        name: "Default Gemini Max Tokens",
        description: "Default max tokens for Gemini chats",
        type: "text",
        placeholder: "400",
        group: "Gemini Defaults",
      },

      // OpenRouter Defaults
      {
        id: "openrouterUrl",
        name: "OpenRouter.ai API URL",
        description: `URL for OpenRouter.ai API\nDefault URL: ${DEFAULT_OPENROUTER_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OPENROUTER_CONFIG.url,
        group: "OpenRouter Defaults",
      },
      {
        id: "openrouterDefaultModel",
        name: "Default OpenRouter Model",
        description: "Default model for OpenRouter chats",
        type: "text",
        placeholder: "openrouter@anthropic/claude-3.5-sonnet",
        group: "OpenRouter Defaults",
      },
      {
        id: "openrouterDefaultTemperature",
        name: "Default OpenRouter Temperature",
        description: "Default temperature for OpenRouter chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "OpenRouter Defaults",
      },
      {
        id: "openrouterDefaultMaxTokens",
        name: "Default OpenRouter Max Tokens",
        description: "Default max tokens for OpenRouter chats",
        type: "text",
        placeholder: "400",
        group: "OpenRouter Defaults",
      },

      // Z.AI Defaults
      {
        id: "zaiUrl",
        name: "Z.AI API URL",
        description: `URL for Z.AI API. Two modes available:\n• Standard API (pay-per-token): ${ZAI_OPENAI_ENDPOINT}\n• Coding Plan (subscription): ${ZAI_ANTHROPIC_ENDPOINT}`,
        type: "text",
        placeholder: DEFAULT_ZAI_CONFIG.url,
        group: "Z.AI Defaults",
      },
      {
        id: "zaiDefaultModel",
        name: "Default Z.AI Model",
        description: "Default model for Z.AI chats (e.g., zai@glm-4.7)",
        type: "text",
        placeholder: DEFAULT_ZAI_CONFIG.model,
        group: "Z.AI Defaults",
      },
      {
        id: "zaiDefaultTemperature",
        name: "Default Z.AI Temperature",
        description: "Default temperature for Z.AI chats (0.0 to 1.0)",
        type: "text",
        placeholder: "0.7",
        group: "Z.AI Defaults",
      },
      {
        id: "zaiDefaultMaxTokens",
        name: "Default Z.AI Max Tokens",
        description: "Default max tokens for Z.AI chats",
        type: "text",
        placeholder: "400",
        group: "Z.AI Defaults",
      },

      // GitHub Copilot Settings (desktop only)
      ...(Platform.isMobile
        ? []
        : [
            {
              id: "copilotEnabled" as keyof ChatGPT_MDSettings,
              name: "Enable GitHub Copilot",
              description:
                "Use your GitHub Copilot subscription for AI conversations. " +
                "Requires GitHub CLI with Copilot extension installed and authenticated.",
              type: "toggle" as const,
              group: "GitHub Copilot",
            },
            {
              id: "copilotCliPath" as keyof ChatGPT_MDSettings,
              name: "GitHub CLI Path (Optional)",
              description:
                "Custom path to GitHub CLI executable. Leave empty to use 'gh' from PATH. " +
                "Example: /usr/local/bin/gh",
              type: "text" as const,
              placeholder: "gh",
              group: "GitHub Copilot",
            },
            {
              id: "copilotDefaultModel" as keyof ChatGPT_MDSettings,
              name: "Default Copilot Model",
              description: `Default model for Copilot chats. Available models depend on your subscription.\nDefault: ${DEFAULT_COPILOT_CONFIG.model}`,
              type: "text" as const,
              placeholder: DEFAULT_COPILOT_CONFIG.model,
              group: "GitHub Copilot",
            },
          ]),

      // Ollama Defaults (Local)
      {
        id: "ollamaUrl",
        name: "Ollama API URL",
        description: `URL for Ollama API\nDefault URL: ${DEFAULT_OLLAMA_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OLLAMA_CONFIG.url,
        group: "Ollama Defaults (Local)",
      },
      {
        id: "ollamaDefaultTemperature",
        name: "Default Ollama Temperature",
        description: "Default temperature for Ollama chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "Ollama Defaults (Local)",
      },

      // LM Studio Defaults (Local)
      {
        id: "lmstudioUrl",
        name: "LM Studio API URL",
        description: `URL for LM Studio API\nDefault URL: ${DEFAULT_LMSTUDIO_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_LMSTUDIO_CONFIG.url,
        group: "LM Studio Defaults (Local)",
      },
      {
        id: "lmstudioDefaultTemperature",
        name: "Default LM Studio Temperature",
        description: "Default temperature for LM Studio chats (0.0 to 2.0)",
        type: "text",
        placeholder: "0.7",
        group: "LM Studio Defaults (Local)",
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
          "Whitelist of models that can use tools (vault search, file read, web search).\n\n" +
          "📝 Pattern Syntax:\n" +
          "  • Exact match: 'gpt-4o' matches only 'gpt-4o'\n" +
          "  • Date auto-match: 'gpt-4o' matches 'gpt-4o-2025-04-16'\n" +
          "  • Wildcard: 'gpt-4*' matches 'gpt-4o', 'gpt-4-turbo', etc.\n\n" +
          "🔧 Current Coverage:\n" +
          "  • OpenAI: 36 patterns (GPT-3.5/4/5, o-series)\n" +
          "  • Anthropic: 9 patterns (Claude 3/3.5/4/4.5)\n" +
          "  • Gemini: 7 patterns (Flash 2.5/3.0)\n" +
          "  • OpenRouter: 109 patterns (DeepSeek, Qwen, Mistral, etc.)\n\n" +
          "💡 Tips:\n" +
          "  • Use 'Reset to Recommended' to restore tested whitelist\n" +
          "  • Lines starting with # are comments\n" +
          "  • One pattern per line or comma-separated",
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

    // Create settings UI
    Object.entries(groupedSettings).forEach(([group, settings]) => {
      containerEl.createEl("h3", { text: group });

      settings.forEach((setting) => {
        this.createSettingElement(containerEl, setting);
      });

      containerEl.createEl("hr");
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
          text.inputEl.style.height = "280px";
          text.inputEl.style.minHeight = "280px";
        }

        return text;
      });

      if (schema.id === "toolEnabledModels") {
        setting.addButton((button) => {
          button
            .setButtonText("Reset to Recommended")
            .setTooltip("Restore the recommended default whitelist")
            .onClick(async () => {
              const defaultWhitelist = getDefaultToolWhitelist();
              this.settingsProvider.settings.toolEnabledModels = defaultWhitelist;
              await this.settingsProvider.saveSettings();
              this.display();
            });
        });
      }
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
