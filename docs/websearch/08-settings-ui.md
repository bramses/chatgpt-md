# Task 8: Add Settings UI

## Priority: MEDIUM
## File: src/Views/ChatGPT_MDSettingsTab.ts

## Goal

Add UI settings for web search configuration.

## Implementation

### Step 1: Add settings to schema

In the `settingsSchema` array, add after the `enableToolCalling` setting:

```typescript
{
  id: "enableWebSearch",
  name: "Enable Web Search",
  description:
    "Allow the AI to search the web for information. " +
    "Requires tool calling to be enabled. " +
    "All searches require your explicit approval.",
  type: "toggle",
  group: "Chat Behavior",
},
{
  id: "webSearchProvider",
  name: "Web Search Provider",
  description: "Search provider to use for web searches",
  type: "dropdown",
  options: {
    duckduckgo: "DuckDuckGo (Free, no API key)",
    brave: "Brave Search (Requires API key)",
    custom: "Custom API Endpoint",
  },
  group: "Chat Behavior",
},
{
  id: "webSearchApiKey",
  name: "Web Search API Key",
  description: "API key for Brave Search or custom endpoint (if required)",
  type: "text",
  placeholder: "your web search API key",
  group: "Chat Behavior",
},
{
  id: "webSearchApiUrl",
  name: "Custom Search API URL",
  description: "URL for custom search API endpoint (only for 'Custom' provider)",
  type: "text",
  placeholder: "https://your-search-api.com/search",
  group: "Chat Behavior",
},
{
  id: "fetchFullContent",
  name: "Fetch Full Page Content",
  description:
    "Fetch complete page content for approved search results. " +
    "May slow down searches and use more tokens.",
  type: "toggle",
  group: "Chat Behavior",
},
{
  id: "maxWebSearchResults",
  name: "Max Web Search Results",
  description: "Maximum number of search results to return (1-10)",
  type: "text",
  placeholder: "5",
  group: "Chat Behavior",
},
```

### Step 2: Update SettingDefinition interface (if needed)

The interface should already support all types used. Verify it includes:

```typescript
interface SettingDefinition {
  id: keyof ChatGPT_MDSettings;
  name: string;
  description: string;
  type: "text" | "textarea" | "toggle" | "dropdown";
  placeholder?: string;
  options?: Record<string, string>;
  group: string;
}
```

## Alternative: Manual Setting Creation

If the schema approach doesn't fit, add settings manually in `display()`:

```typescript
// Web Search section
containerEl.createEl("h3", { text: "Web Search" });

new Setting(containerEl)
  .setName("Enable web search")
  .setDesc("Allow the AI to search the web for information (requires tool calling)")
  .addToggle((toggle) =>
    toggle
      .setValue(this.settingsProvider.settings.enableWebSearch)
      .onChange(async (value) => {
        this.settingsProvider.settings.enableWebSearch = value;
        await this.settingsProvider.saveSettings();
      })
  );

new Setting(containerEl)
  .setName("Web search provider")
  .setDesc("Search provider to use")
  .addDropdown((dropdown) =>
    dropdown
      .addOption("duckduckgo", "DuckDuckGo (Free)")
      .addOption("brave", "Brave Search (API key)")
      .addOption("custom", "Custom Endpoint")
      .setValue(this.settingsProvider.settings.webSearchProvider)
      .onChange(async (value: 'duckduckgo' | 'brave' | 'custom') => {
        this.settingsProvider.settings.webSearchProvider = value;
        await this.settingsProvider.saveSettings();
      })
  );

new Setting(containerEl)
  .setName("Web search API key")
  .setDesc("API key for Brave or custom provider")
  .addText((text) =>
    text
      .setPlaceholder("your API key")
      .setValue(this.settingsProvider.settings.webSearchApiKey || "")
      .onChange(async (value) => {
        this.settingsProvider.settings.webSearchApiKey = value;
        await this.settingsProvider.saveSettings();
      })
  );

new Setting(containerEl)
  .setName("Fetch full page content")
  .setDesc("Include complete page content from approved results")
  .addToggle((toggle) =>
    toggle
      .setValue(this.settingsProvider.settings.fetchFullContent)
      .onChange(async (value) => {
        this.settingsProvider.settings.fetchFullContent = value;
        await this.settingsProvider.saveSettings();
      })
  );
```

## Location in File

- Schema approach: In `settingsSchema` array (~line 39), after `enableToolCalling`
- Manual approach: In `display()` method, create a new section

## Verification

```bash
npm run build
npm run lint
```

## Dependencies

- Task 2 (settings in Config.ts) must be completed

## Notes

- Settings should appear near the tool calling toggle
- Provider dropdown shows which options need API keys
- API key field is only relevant for Brave and Custom
- Max results helps control token usage

## Testing

1. Open Obsidian Settings
2. Navigate to ChatGPT MD settings
3. Verify new settings appear
4. Toggle enable web search
5. Change provider dropdown
6. Enter API key (for Brave)
7. Verify settings persist after reload

## Next Task

All tasks complete! Run verification:

```bash
npm run build
npm run lint
```

Then test the feature manually.
