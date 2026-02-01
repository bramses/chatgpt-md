import { Editor, MarkdownView, Notice } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { AI_SERVICE_OPENROUTER, INFER_TITLE_COMMAND_ID } from "src/Constants";
import { getAiApiUrls } from "./CommandUtilities";
import { CommandMetadata, EditorViewCommandHandler, StatusBarManager } from "./CommandHandler";

/**
 * Handler for inferring titles from conversations
 */
export class InferTitleHandler implements EditorViewCommandHandler {
  private statusBarManager: StatusBarManager;

  constructor(
    private services: ServiceContainer,
    private stopStreamingHandler: { setCurrentAiService: (aiService: any) => void }
  ) {
    this.statusBarManager = new StatusBarManager(services.plugin);
  }

  async execute(editor: Editor, view: MarkdownView): Promise<void> {
    const { editorService, settingsService, apiAuthService } = this.services;
    const settings = settingsService.getSettings();

    // Get frontmatter
    const frontmatter = await editorService.getFrontmatter(view, settings, this.services.app);
    const aiService = this.services.aiProviderService();

    // Store the AI service for stop streaming
    this.stopStreamingHandler.setCurrentAiService(aiService);

    // Ensure model is set
    if (!frontmatter.model) {
      new Notice("Model not set in frontmatter. Please configure a model in settings or frontmatter.");
      return;
    }

    this.statusBarManager.setText(`Calling ${frontmatter.model}`);
    const { messages } = await editorService.getMessagesFromEditor(editor, settings);

    // Use the utility function to get the correct API key
    const settingsWithApiKey = {
      ...settings,
      ...frontmatter,
      openrouterApiKey: apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
      url: getAiApiUrls(frontmatter)[frontmatter.aiService],
    };

    await aiService.inferTitle(view, settingsWithApiKey, messages, editorService);
    this.statusBarManager.clear();
  }

  getCommand(): CommandMetadata {
    return {
      id: INFER_TITLE_COMMAND_ID,
      name: "Infer title",
      icon: "subtitles",
    };
  }
}
