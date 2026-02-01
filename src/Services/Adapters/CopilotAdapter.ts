import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";
import { Platform } from "obsidian";

/**
 * Known models available through GitHub Copilot
 * These models depend on user's subscription level (Free, Pro, Pro+, Enterprise)
 */
const COPILOT_KNOWN_MODELS = [
  "gpt-4o",
  "gpt-4.1",
  "gpt-5",
  "claude-sonnet-4",
  "claude-sonnet-4.5",
  "o1",
  "o3-mini",
  "gemini-2.0-flash",
];

/**
 * Adapter for GitHub Copilot provider
 * Uses the GitHub Copilot CLI for authentication and the Copilot SDK for API calls
 *
 * Key differences from other providers:
 * - Uses CLI-based authentication (gh copilot auth)
 * - Session-based API instead of REST API
 * - Event-based streaming instead of SSE
 * - No API key required (uses GitHub OAuth)
 */
export class CopilotAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "copilot";
  readonly displayName = "GitHub Copilot";

  /**
   * Copilot doesn't use a traditional base URL
   * The SDK handles endpoint routing internally
   */
  getDefaultBaseUrl(): string {
    return "https://api.githubcopilot.com";
  }

  /**
   * Copilot uses CLI-based OAuth, not API keys
   */
  getAuthHeaders(_apiKey: string | undefined): Record<string, string> {
    return { "Content-Type": "application/json" };
  }

  /**
   * Return known models with copilot@ prefix
   * Copilot SDK doesn't have a model list API - available models depend on subscription
   */
  async fetchModels(
    _url: string,
    _apiKey: string | undefined,
    settings: ChatGPT_MDSettings | undefined,
    _makeGetRequest: (url: string, headers: Record<string, string>, provider: string) => Promise<any>
  ): Promise<string[]> {
    // Don't show Copilot models on mobile (CLI not available)
    if (Platform.isMobile) {
      return [];
    }

    // Don't show models if Copilot is disabled
    if (settings && !settings.copilotEnabled) {
      return [];
    }

    return COPILOT_KNOWN_MODELS.map((model) => this.prefixModelId(model));
  }

  /**
   * Copilot uses CLI-based authentication, not API keys
   */
  requiresApiKey(): boolean {
    return false;
  }

  /**
   * Copilot has its own built-in tools - disable plugin tool calling
   * This can be revisited later if tool bridging is needed
   */
  supportsToolCalling(): boolean {
    return false;
  }

  /**
   * Check if Copilot CLI is available on the system
   * @returns Promise<boolean> true if CLI is available
   */
  async isCliAvailable(cliPath?: string): Promise<boolean> {
    if (Platform.isMobile) {
      return false;
    }

    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      const command = cliPath || "gh";
      await execAsync(`${command} copilot --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a helpful error message when CLI is not available
   */
  getCliNotFoundError(): string {
    return (
      "GitHub Copilot CLI not found. Please install it:\n" +
      "1. Install GitHub CLI: https://cli.github.com/\n" +
      "2. Install Copilot extension: gh extension install github/gh-copilot\n" +
      "3. Authenticate: gh auth login && gh copilot auth"
    );
  }
}
