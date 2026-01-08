import { Editor, MarkdownView } from "obsidian";
import { ServiceContainer } from "src/core/ServiceContainer";
import { STOP_STREAMING_COMMAND_ID } from "src/Constants";

/**
 * Handler for stopping streaming responses
 */
export class StopStreamingHandler {
	private currentAiService: any = null;

	constructor(private services: ServiceContainer) {}

	setCurrentAiService(aiService: any): void {
		this.currentAiService = aiService;
	}

	execute(): void {
		// Use the aiService's stopStreaming method if available
		if (this.currentAiService && "stopStreaming" in this.currentAiService) {
			// @ts-ignore - Call the stopStreaming method
			this.currentAiService.stopStreaming();
		} else {
			// No active AI service to stop streaming
			this.services.notificationService.showWarning("No active streaming request to stop");
		}
	}

	static getCommand() {
		return {
			id: STOP_STREAMING_COMMAND_ID,
			name: "Stop streaming",
			icon: "octagon",
		};
	}
}
