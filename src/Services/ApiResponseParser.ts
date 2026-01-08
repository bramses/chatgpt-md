import {
	AI_SERVICE_ANTHROPIC,
	AI_SERVICE_GEMINI,
	AI_SERVICE_LMSTUDIO,
	AI_SERVICE_OLLAMA,
	AI_SERVICE_OPENAI,
	AI_SERVICE_OPENROUTER,
	ROLE_ASSISTANT,
	TRUNCATION_ERROR_FULL,
	TRUNCATION_ERROR_PARTIAL,
} from "src/Constants";
import { Editor } from "obsidian";
import { NotificationService } from "./NotificationService";
import { insertAssistantHeader, parseNonStreamingResponse } from "src/Utilities/ResponseHelpers";

/**
 * ApiResponseParser handles parsing of API responses
 * Now uses utility functions for common operations
 */
export class ApiResponseParser {
	private notificationService: NotificationService;

	constructor(notificationService?: NotificationService) {
		this.notificationService = notificationService || new NotificationService();
	}

	/**
	 * Insert the assistant header at the current cursor position
	 * Delegates to utility function
	 */
	insertAssistantHeader(
		editor: Editor,
		headingPrefix: string,
		model: string
	): {
		initialCursor: { line: number; ch: number };
		newCursor: { line: number; ch: number };
	} {
		return insertAssistantHeader(editor, headingPrefix, model);
	}

	/**
	 * Parse a non-streaming API response
	 * Delegates to utility function
	 */
	parseNonStreamingResponse(data: any, serviceType: string): string {
		return parseNonStreamingResponse(data, serviceType);
	}
}
