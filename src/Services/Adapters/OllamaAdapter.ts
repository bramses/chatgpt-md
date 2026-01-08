import { ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderAdapter, ProviderType, ProviderModelData } from "./ProviderAdapter";

/**
 * Model data from Ollama API
 */
interface OllamaModel extends ProviderModelData {
	name: string;
}

/**
 * Adapter for Ollama (local) API provider
 * Encapsulates Ollama-specific logic and configuration
 */
export class OllamaAdapter implements ProviderAdapter {
	readonly type: ProviderType = "ollama";
	readonly displayName = "Ollama";

	getDefaultBaseUrl(): string {
		return "http://localhost:11434";
	}

	getAuthHeaders(apiKey: string | undefined): Record<string, string> {
		// Ollama doesn't require authentication
		return { "Content-Type": "application/json" };
	}

	async fetchModels(
		url: string,
		apiKey: string | undefined,
		settings: ChatGPT_MDSettings | undefined,
		makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
	): Promise<string[]> {
		try {
			const headers = this.getAuthHeaders(apiKey);
			const json = await makeGetRequest(`${url}/api/tags`, headers, this.type);
			const models = json.models;

			return models
				.sort((a: OllamaModel, b: OllamaModel) => {
					if (a.name < b.name) return 1;
					if (a.name > b.name) return -1;
					return 0;
				})
				.map((model: OllamaModel) => `${this.type}@${model.name}`);
		} catch (error) {
			console.error("Error fetching Ollama models:", error);
			return [];
		}
	}

	getSystemMessageRole(): "system" | "developer" {
		return "system"; // Ollama uses standard system role
	}

	supportsSystemField(): boolean {
		return false; // Ollama uses messages array, not system field
	}

	supportsToolCalling(): boolean {
		return true; // Some Ollama models support tool calling
	}

	requiresApiKey(): boolean {
		return false; // Ollama doesn't require API key
	}

	extractModelName(modelId: string): string {
		// Remove provider prefix if present
		if (modelId.startsWith(`${this.type}@`)) {
			return modelId.substring(this.type.length + 1);
		}
		return modelId;
	}
}
