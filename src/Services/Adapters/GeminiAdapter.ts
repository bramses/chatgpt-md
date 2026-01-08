import { ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderAdapter, ProviderType, ProviderModelData } from "./ProviderAdapter";

/**
 * Model data from Gemini API
 */
interface GeminiModel extends ProviderModelData {
	name: string;
	displayName: string;
}

/**
 * Adapter for Google Gemini API provider
 * Encapsulates Gemini-specific logic and configuration
 */
export class GeminiAdapter implements ProviderAdapter {
	readonly type: ProviderType = "gemini";
	readonly displayName = "Gemini";

	getDefaultBaseUrl(): string {
		return "https://generativelanguage.googleapis.com";
	}

	getAuthHeaders(apiKey: string): Record<string, string> {
		// Gemini uses API key as query parameter, not in headers
		return {
			"Content-Type": "application/json",
		};
	}

	async fetchModels(
		url: string,
		apiKey: string | undefined,
		settings: ChatGPT_MDSettings | undefined,
		makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
	): Promise<string[]> {
		try {
			if (!apiKey) {
				console.error("Gemini API key is missing. Please add your Gemini API key in the settings.");
				return [];
			}

			// Gemini API key is passed as query parameter
			const modelsUrl = `${url}/v1beta/models?key=${apiKey}`;
			const headers = this.getAuthHeaders(apiKey);
			const response = await makeGetRequest(modelsUrl, headers, this.type);

			if (response.models && Array.isArray(response.models)) {
				return response.models
					.filter((model: GeminiModel) => model.name && model.name.includes("generate"))
					.map((model: GeminiModel) => {
						// Extract model name from full resource path
						const modelId = model.name.split("/").pop();
						return `${this.type}@${modelId}`;
					})
					.sort();
			}

			return [];
		} catch (error) {
			console.error("Error fetching Gemini models:", error);
			return [];
		}
	}

	getSystemMessageRole(): "system" | "developer" {
		return "system"; // Gemini uses system role
	}

	supportsSystemField(): boolean {
		return false; // Gemini uses messages array
	}

	supportsToolCalling(): boolean {
		return true; // Gemini supports tool calling (function calling)
	}

	requiresApiKey(): boolean {
		return true; // Gemini requires API key
	}

	extractModelName(modelId: string): string {
		// Remove provider prefix if present
		if (modelId.startsWith(`${this.type}@`)) {
			return modelId.substring(this.type.length + 1);
		}
		return modelId;
	}
}
