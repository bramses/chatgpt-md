import { ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderAdapter, ProviderType, ProviderModelData } from "./ProviderAdapter";

/**
 * Model data from LM Studio API (OpenAI-compatible format)
 */
interface LMStudioModel extends ProviderModelData {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}

/**
 * Adapter for LM Studio (local) API provider
 * Encapsulates LM Studio-specific logic and configuration
 * Uses OpenAI-compatible API format
 */
export class LmStudioAdapter implements ProviderAdapter {
	readonly type: ProviderType = "lmstudio";
	readonly displayName = "LM Studio";

	getDefaultBaseUrl(): string {
		return "http://localhost:1234";
	}

	getAuthHeaders(apiKey: string | undefined): Record<string, string> {
		// LM Studio doesn't require authentication
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
			const models = await makeGetRequest(`${url}/v1/models`, headers, this.type);

			if (models.data && Array.isArray(models.data)) {
				return models.data
					.map((model: LMStudioModel) => `${this.type}@${model.id}`)
					.sort();
			}

			return [];
		} catch (error) {
			console.error("Error fetching LM Studio models:", error);
			return [];
		}
	}

	getSystemMessageRole(): "system" | "developer" {
		return "system"; // LM Studio uses standard system role
	}

	supportsSystemField(): boolean {
		return false; // LM Studio uses messages array, not system field
	}

	supportsToolCalling(): boolean {
		return false; // Most local models don't support tool calling
	}

	requiresApiKey(): boolean {
		return false; // LM Studio doesn't require API key
	}

	extractModelName(modelId: string): string {
		// Remove provider prefix if present
		if (modelId.startsWith(`${this.type}@`)) {
			return modelId.substring(this.type.length + 1);
		}
		return modelId;
	}
}
