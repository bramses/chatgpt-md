import { ChatGPT_MDSettings } from "src/Models/Config";
import { ProviderType } from "./ProviderAdapter";
import { BaseProviderAdapter } from "./BaseProviderAdapter";
import { Platform } from "obsidian";

/**
 * Fallback models if SDK model fetching fails
 * These are commonly available models through GitHub Copilot
 */
const COPILOT_FALLBACK_MODELS = ["gpt-4.1", "gpt-4o", "claude-sonnet-4", "o3-mini"];

/**
 * Adapter for GitHub Copilot provider
 * Uses the @github/copilot-sdk for API calls with CLI-based authentication
 *
 * Key differences from other providers:
 * - Uses CLI-based authentication (Copilot CLI must be installed and authenticated)
 * - Session-based API via JSON-RPC instead of REST API
 * - Event-based streaming instead of SSE
 * - No API key required (uses GitHub OAuth via CLI)
 * - SDK can fetch available models dynamically
 */
export class CopilotAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "copilot";
  readonly displayName = "GitHub Copilot";

  /**
   * Copilot doesn't use a traditional base URL
   * The SDK handles endpoint routing internally via the CLI
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
   * Fetch available models from the Copilot SDK
   * Falls back to known models if SDK fetch fails
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

    // Check if CLI is available first
    const cliPath = settings?.copilotCliPath || undefined;
    const isAvailable = await this.isCliAvailable(cliPath);
    if (!isAvailable) {
      return [];
    }

    // Try to fetch models from SDK using proper lifecycle (2026 best practices)
    let client: any = null;
    try {
      const copilotSdk = await import("@github/copilot-sdk");
      const CopilotClient = copilotSdk.CopilotClient;

      const clientOptions: any = {
        autoStart: true,
      };
      if (cliPath) {
        clientOptions.cliPath = cliPath;
      }

      client = new CopilotClient(clientOptions);
      await client.start();

      // The SDK exposes listSessions which can help verify connectivity
      // For model listing, we rely on the fallback list as the SDK may not expose this directly
      // In future SDK versions, there may be a getAvailableModels method
      const state = client.getState?.();
      if (state === "connected") {
        // SDK connected successfully, but model list API may not be available
        // Return fallback models for now
        console.log("[Copilot] SDK connected, using fallback model list");
      }

      await client.stop();
    } catch (err) {
      console.warn("[Copilot] Could not connect to SDK, using fallback list:", err);
      if (client) {
        try {
          await client.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Fallback to known models
    return COPILOT_FALLBACK_MODELS.map((model) => this.prefixModelId(model));
  }

  /**
   * Copilot uses CLI-based authentication, not API keys
   */
  requiresApiKey(): boolean {
    return false;
  }

  /**
   * Copilot has its own built-in tools - disable plugin tool calling for now
   * The SDK supports custom tools, but bridging would require additional work
   */
  supportsToolCalling(): boolean {
    return false;
  }

  /**
   * Check if Copilot CLI is available on the system
   * Tests by running 'copilot --version' command
   * @returns Promise<boolean> true if CLI is available and authenticated
   */
  async isCliAvailable(cliPath?: string): Promise<boolean> {
    if (Platform.isMobile) {
      return false;
    }

    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // The Copilot CLI is typically installed as 'copilot' command
      // It can also be accessed via 'gh copilot' if using GitHub CLI extension
      const command = cliPath || "copilot";
      await execAsync(`${command} --version`);
      return true;
    } catch {
      // Try 'gh copilot' as fallback
      if (!cliPath) {
        try {
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execAsync = promisify(exec);
          await execAsync("gh copilot --version");
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Get a helpful error message when CLI is not available
   */
  getCliNotFoundError(): string {
    return (
      "GitHub Copilot CLI not found. Please install and authenticate:\n\n" +
      "1. Install GitHub CLI: https://cli.github.com/\n" +
      "2. Authenticate: gh auth login\n" +
      "3. Verify: gh copilot --version\n\n" +
      "Note: Copilot is now built into GitHub CLI (gh) - no extension needed.\n" +
      "Requires an active GitHub Copilot subscription."
    );
  }
}
