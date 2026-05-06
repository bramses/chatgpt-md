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
    const isOauthBridgeMode = settings?.openaiAuthMode === "oauth_bridge";
    const isOfficialOpenAiUrl = this.isOfficialOpenAiUrl(url);
    const canFetchWithoutApiKey = isOauthBridgeMode && !isOfficialOpenAiUrl;

    if (!canFetchWithoutApiKey && !this.validateApiKey(apiKey)) {
      return [];
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const models = await makeGetRequest(`${url}/v1/models`, headers, this.type);

      const modelData = Array.isArray(models?.data) ? models.data : [];
      const useStrictFiltering = isOfficialOpenAiUrl && !isOauthBridgeMode;

      const filteredModels = useStrictFiltering
        ? modelData.filter((model: OpenAIModel) => this.isValidChatModel(model))
        : modelData.filter((model: OpenAIModel) => typeof model?.id === "string" && model.id.trim().length > 0);

      return filteredModels
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

  private isOfficialOpenAiUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === "api.openai.com";
    } catch {
      return false;
    }
  }

  getSystemMessageRole(): "system" | "developer" {
    return "developer"; // OpenAI prefers developer role for system messages
  }
}
