import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

/**
 * Model data from OpenAI API
 */
interface OpenAIModel extends ProviderModelData {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * Adapter for OpenAI API provider
 * Encapsulates OpenAI-specific logic and configuration
 */
export class OpenAIAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "openai";
  readonly displayName = "OpenAI";

  getDefaultBaseUrl(): string {
    return "https://api.openai.com";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    if (!this.validateApiKey(apiKey)) {
      return [];
    }

    try {
      const headers = this.getAuthHeaders(apiKey!); // Non-null assertion: validated above
      const models = await makeGetRequest(`${url}/v1/models`, headers, this.type);

      return models.data
        .filter((model: OpenAIModel) => this.isValidChatModel(model))
        .sort((a: OpenAIModel, b: OpenAIModel) => {
          if (a.id < b.id) return 1;
          if (a.id > b.id) return -1;
          return 0;
        })
        .map((model: OpenAIModel) => this.prefixModelId(model.id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }

  /**
   * Filter predicate for valid OpenAI chat models
   * Excludes audio, transcription, realtime, and TTS models
   */
  private isValidChatModel(model: OpenAIModel): boolean {
    const id = model.id;
    const isGenerationModel =
      id.includes("o3") ||
      id.includes("o4") ||
      id.includes("o1") ||
      id.includes("gpt-4") ||
      id.includes("gpt-5") ||
      id.includes("gpt-3");

    const isExcluded =
      id.includes("audio") ||
      id.includes("transcribe") ||
      id.includes("realtime") ||
      id.includes("o1-pro") ||
      id.includes("tts");

    return isGenerationModel && !isExcluded;
  }

  getSystemMessageRole(): "system" | "developer" {
    return "developer"; // OpenAI prefers developer role for system messages
  }
}
