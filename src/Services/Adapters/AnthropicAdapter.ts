import { requestUrl } from "obsidian";
import { ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderAdapter, ProviderType, ProviderModelData } from "./ProviderAdapter";

/**
 * Model data from Anthropic API
 */
interface AnthropicModel extends ProviderModelData {
	id: string;
	type: string;
}

/**
 * Adapter for Anthropic (Claude) API provider
 * Encapsulates Anthropic-specific logic and configuration
 */
export class AnthropicAdapter implements ProviderAdapter {
	readonly type: ProviderType = "anthropic";
	readonly displayName = "Anthropic";

	getDefaultBaseUrl(): string {
		return "https://api.anthropic.com";
	}

	getAuthHeaders(apiKey: string): Record<string, string> {
		return {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-dangerous-direct-browser-access": "true",
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
				console.error("Anthropic API key is missing. Please add your Anthropic API key in the settings.");
				return [];
			}

			const modelsUrl = `${url.replace(/\/$/, "")}/v1/models`;
			const headers = this.getAuthHeaders(apiKey);

			// Anthropic uses requestUrl directly (not through apiService)
			const response = await requestUrl({
				url: modelsUrl,
				method: "GET",
				headers: headers,
			});

			const data = response.json;

			if (data.data && Array.isArray(data.data)) {
				return data.data
					.filter((model: AnthropicModel) => model.type === "model" && model.id)
					.map((model: AnthropicModel) => `${this.type}@${model.id}`)
					.sort();
			}

			console.warn("Unexpected response format from Anthropic models API");
			return [];
		} catch (error) {
			console.error("Error fetching Anthropic models:", error);
			return [];
		}
	}

	getSystemMessageRole(): "system" | "developer" {
		return "system"; // Anthropic uses system field, not message role
	}

	supportsSystemField(): boolean {
		return true; // Anthropic supports system field in payload
	}

	supportsToolCalling(): boolean {
		return true; // Claude 3+ models support tool calling
	}

	requiresApiKey(): boolean {
		return true; // Anthropic requires API key
	}

	extractModelName(modelId: string): string {
		// Remove provider prefix if present
		if (modelId.startsWith(`${this.type}@`)) {
			return modelId.substring(this.type.length + 1);
		}
		return modelId;
	}
}
