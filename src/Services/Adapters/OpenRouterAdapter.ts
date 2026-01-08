import { ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderAdapter, ProviderType, ProviderModelData } from "./ProviderAdapter";

/**
 * Model data from OpenRouter API
 */
interface OpenRouterModel extends ProviderModelData {
	id: string;
	name: string;
	context_length: number;
	pricing: {
		prompt: number;
		completion: number;
	};
	supported_parameters?: string[];
}

/**
 * Adapter for OpenRouter API provider
 * Encapsulates OpenRouter-specific logic and configuration
 */
export class OpenRouterAdapter implements ProviderAdapter {
	readonly type: ProviderType = "openrouter";
	readonly displayName = "OpenRouter";

	getDefaultBaseUrl(): string {
		return "https://openrouter.ai";
	}

	getAuthHeaders(apiKey: string): Record<string, string> {
		return {
			"Authorization": `Bearer ${apiKey}`,
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
				console.error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
				return [];
			}

			const headers = this.getAuthHeaders(apiKey);
			const models = await makeGetRequest(`${url}/api/v1/models`, headers, this.type);

			return models.data
				.sort((a: OpenRouterModel, b: OpenRouterModel) => {
					if (a.id < b.id) return 1;
					if (a.id > b.id) return -1;
					return 0;
				})
				.map((model: OpenRouterModel) => `${this.type}@${model.id}`);
		} catch (error) {
			console.error("Error fetching OpenRouter models:", error);
			return [];
		}
	}

	getSystemMessageRole(): "system" | "developer" {
		return "system"; // OpenRouter uses standard system role
	}

	supportsSystemField(): boolean {
		return false; // OpenRouter uses messages array, not system field
	}

	supportsToolCalling(): boolean {
		return true; // OpenRouter supports tool calling
	}

	requiresApiKey(): boolean {
		return true; // OpenRouter requires API key
	}

	extractModelName(modelId: string): string {
		// Remove provider prefix if present
		if (modelId.startsWith(`${this.type}@`)) {
			return modelId.substring(this.type.length + 1);
		}
		return modelId;
	}
}
