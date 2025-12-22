import { App, Editor, Notice, setIcon, SuggestModal } from "obsidian";
import { EditorService } from "../Services/EditorService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ModelCapabilitiesCache } from "src/Models/ModelCapabilities";

export class AiModelSuggestModal extends SuggestModal<string> {
  private modelNames: string[];
  private editor: Editor;
  private editorService: EditorService;
  private settings: ChatGPT_MDSettings;
  private capabilitiesCache: ModelCapabilitiesCache;

  constructor(
    app: App,
    editor: Editor,
    editorService: EditorService,
    modelNames: string[] = [],
    settings?: ChatGPT_MDSettings,
    capabilitiesCache?: ModelCapabilitiesCache
  ) {
    super(app);
    this.modelNames = modelNames;
    this.editor = editor;
    this.editorService = editorService;
    this.settings = settings!;
    this.capabilitiesCache = capabilitiesCache!;
    this.limit = this.modelNames.length;
    if (this.modelNames.length > 0) {
      this.setPlaceholder("Select Large Language Model");
    } else {
      this.setPlaceholder("Loading available models...");
    }
  }

  getSuggestions(query: string): string[] {
    return this.modelNames.filter((model) => model.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(model: string, el: HTMLElement) {
    const container = el.createEl("div", { cls: "ai-model-suggestion" });
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "8px";

    container.createEl("span", { text: model });

    // Add tool icon if tool calling is enabled and model supports tools
    if (this.settings?.enableToolCalling && this.capabilitiesCache?.supportsTools(model)) {
      const toolIcon = container.createEl("span", { cls: "ai-model-tool-icon" });
      toolIcon.title = "This model supports tool calling";
      // Use Obsidian's wrench icon from Lucide
      setIcon(toolIcon, "wrench");
    }
  }

  async onChooseSuggestion(modelName: string, evt: MouseEvent | KeyboardEvent) {
    if (this.modelNames.indexOf(modelName) === -1 || this.modelNames.length === 0) {
      return;
    }

    new Notice(`Selected model: ${modelName}`);
    try {
      await this.editorService.setModel(this.editor, modelName);
    } catch (error) {
      console.error("[ChatGPT MD] Error setting model in frontmatter:", error);
      new Notice(`Error setting model: ${error.message}`);
    }
  }
}
