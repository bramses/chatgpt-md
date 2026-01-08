import { Editor, MarkdownView } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { INFER_TITLE_COMMAND_ID, AI_SERVICE_OPENROUTER } from "src/Constants";
import { getAiApiUrls } from "./CommandUtilities";

/**
 * Handler for inferring titles from conversations
 */
export class InferTitleHandler {
	private statusBarItemEl: HTMLElement;

	constructor(
		private services: ServiceContainer,
		private stopStreamingHandler: { setCurrentAiService: (aiService: any) => void }
	) {
		this.statusBarItemEl = services.plugin.addStatusBarItem();
	}

	async execute(editor: Editor, view: MarkdownView | any): Promise<void> {
		const { editorService, settingsService, apiAuthService } = this.services;
		const settings = settingsService.getSettings();

		// Get frontmatter
		const frontmatter = await editorService.getFrontmatter(view, settings, this.services.app);
		const aiService = this.services.aiProviderService();

		// Store the AI service for stop streaming
		this.stopStreamingHandler.setCurrentAiService(aiService);

		// Ensure model is set
		if (!frontmatter.model) {
			console.log("[ChatGPT MD] Model not set in frontmatter, using default model");
			return;
		}

		this.updateStatusBar(`Calling ${frontmatter.model}`);
		const { messages } = await editorService.getMessagesFromEditor(editor, settings);

		// Use the utility function to get the correct API key
		const settingsWithApiKey = {
			...settings,
			...frontmatter,
			openrouterApiKey: apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
			url: getAiApiUrls(frontmatter)[frontmatter.aiService],
		};

		await aiService.inferTitle(view, settingsWithApiKey, messages, editorService);
		this.updateStatusBar("");
	}

	static getCommand() {
		return {
			id: INFER_TITLE_COMMAND_ID,
			name: "Infer title",
			icon: "subtitles",
		};
	}

	private updateStatusBar(text: string): void {
		this.statusBarItemEl.setText(text);
	}
}
