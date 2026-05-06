import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderModelData, ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";

interface OpenAICodexModel extends ProviderModelData {
  id: string;
}

/**
 * Adapter for the local OpenAI Codex OAuth bridge.
 *
 * This is intentionally distinct from the direct OpenAI API provider. It is
 * expected to talk to a local OpenAI-compatible bridge backed by Codex OAuth.
 */
export class OpenAICodexAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "openai-codex";
  readonly displayName = "OpenAI Codex";

  getDefaultBaseUrl(): string {
    return "http://openai-codex.local:1455";
  }

  getAuthHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    return headers;
  }

  async fetchModels(
    url: string,
    apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    const authMode = settings?.openaiCodexAuthMode || "native";
    const canFetchWithoutToken = authMode === "native" && this.isLocalBridgeUrl(url);
    const hasToken = typeof apiKey === "string" && apiKey.trim().length > 0;
    if (!canFetchWithoutToken && !hasToken) {
      this.handleFetchError(new Error("OpenAI Codex token is required for non-local bridge URLs"));
      return [];
    }

    try {
      const headers = this.getAuthHeaders(apiKey || "");
      const models = await makeGetRequest(`${url}/v1/models`, headers, this.type);
      const modelData = Array.isArray(models?.data) ? models.data : [];

      return modelData
        .filter((model: OpenAICodexModel) => typeof model?.id === "string" && model.id.trim().length > 0)
        .sort((a: OpenAICodexModel, b: OpenAICodexModel) => {
          if (a.id < b.id) return 1;
          if (a.id > b.id) return -1;
          return 0;
        })
        .map((model: OpenAICodexModel) => this.prefixModelId(model.id));
    } catch (error) {
      this.handleFetchError(error);
      return [];
    }
  }

  getSystemMessageRole(): "system" | "developer" {
    return "developer";
  }

  supportsToolCalling(): boolean {
    return false;
  }

  requiresApiKey(): boolean {
    // Local codex bridge may use native/session auth and not require an explicit token.
    return false;
  }

  private isLocalBridgeUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === "openai-codex.local" || host === "localhost" || host === "127.0.0.1";
    } catch {
      return false;
    }
  }
}
