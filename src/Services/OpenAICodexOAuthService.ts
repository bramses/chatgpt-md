import { Notice, requestUrl } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { validateUrl } from "src/Utilities/InputValidator";

interface PendingOAuthFlow {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export class OpenAICodexOAuthService {
  private pendingFlow: PendingOAuthFlow | null = null;

  async beginOAuthFlow(settings: ChatGPT_MDSettings, saveSettings: () => Promise<void>): Promise<void> {
    this.validateOauthSettings(settings);

    const state = this.generateRandomString(32);
    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.createCodeChallenge(codeVerifier);
    const authorizationUrl = this.buildAuthorizationUrl(settings, state, codeChallenge);

    this.pendingFlow = {
      state,
      codeVerifier,
      createdAt: Date.now(),
    };

    const autoCaptureSupported = this.canAutoCaptureCallback(settings.openaiCodexOAuthRedirectUri);

    this.openInBrowser(authorizationUrl);

    if (!autoCaptureSupported) {
      new Notice(
        "OpenAI Codex OAuth: Browser opened. After login, copy the full callback URL and paste it into 'Exchange Codex Callback URL'.",
        10000
      );
      return;
    }

    new Notice("OpenAI Codex OAuth: Browser opened. Waiting for callback...", 7000);

    const callbackParams = await this.waitForOAuthCallback(settings.openaiCodexOAuthRedirectUri, state, 180000);
    await this.exchangeAndSaveToken(callbackParams, settings, saveSettings);

    new Notice("OpenAI Codex OAuth connected. Local bridge token saved.", 6000);
  }

  async exchangeCallbackUrl(
    callbackUrl: string,
    settings: ChatGPT_MDSettings,
    saveSettings: () => Promise<void>
  ): Promise<void> {
    if (!callbackUrl || !callbackUrl.trim()) {
      throw new Error("Callback URL cannot be empty");
    }

    const parsed = new URL(callbackUrl.trim());
    const params = parsed.searchParams;
    await this.exchangeAndSaveToken(params, settings, saveSettings);

    new Notice("OpenAI Codex OAuth token exchange complete.", 6000);
  }

  async refreshAccessTokenIfNeeded(settings: ChatGPT_MDSettings, saveSettings: () => Promise<void>): Promise<void> {
    const refreshToken = settings.openaiCodexRefreshToken?.trim();
    const tokenUrl = settings.openaiCodexOAuthTokenUrl?.trim();
    const clientId = settings.openaiCodexOAuthClientId?.trim();

    if (!refreshToken || !tokenUrl || !clientId) {
      return;
    }

    const now = Date.now();
    const expiresAt = settings.openaiCodexAccessTokenExpiresAt || 0;
    const refreshThresholdMs = 2 * 60 * 1000;

    if (expiresAt > now + refreshThresholdMs) {
      return;
    }

    const form = new URLSearchParams();
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", refreshToken);
    form.set("client_id", clientId);

    if (settings.openaiCodexOAuthClientSecret?.trim()) {
      form.set("client_secret", settings.openaiCodexOAuthClientSecret.trim());
    }

    if (settings.openaiCodexOAuthScopes?.trim()) {
      form.set("scope", settings.openaiCodexOAuthScopes.trim());
    }

    const response = await requestUrl({
      url: tokenUrl,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      headers: {
        Accept: "application/json",
      },
      body: form.toString(),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`OpenAI Codex OAuth token refresh failed (${response.status})`);
    }

    const data = response.json as OAuthTokenResponse;
    if (!data?.access_token) {
      throw new Error("OpenAI Codex OAuth token refresh did not return access_token");
    }

    settings.openaiCodexAccessToken = data.access_token;
    if (data.refresh_token) {
      settings.openaiCodexRefreshToken = data.refresh_token;
    }

    const expiresInSeconds = Number(data.expires_in || 0);
    settings.openaiCodexAccessTokenExpiresAt =
      expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : settings.openaiCodexAccessTokenExpiresAt;

    await saveSettings();
  }

  async verifyCurrentToken(settings: ChatGPT_MDSettings): Promise<{ ok: boolean; message: string }> {
    const baseUrl = settings.openaiCodexUrl?.trim();
    const token = settings.openaiCodexAccessToken?.trim();

    if (!baseUrl) {
      return { ok: false, message: "OpenAI Codex URL is empty." };
    }

    if (!token) {
      return { ok: false, message: "OpenAI Codex local bridge token is empty." };
    }

    const response = await requestUrl({
      url: `${baseUrl}/v1/models`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      return { ok: false, message: `OpenAI Codex token check failed (${response.status}).` };
    }

    const modelCount = Array.isArray(response.json?.data) ? response.json.data.length : 0;
    return { ok: true, message: `OpenAI Codex bridge reachable. Found ${modelCount} models.` };
  }

  async verifyBridgeHealth(settings: ChatGPT_MDSettings): Promise<{ ok: boolean; message: string }> {
    const baseUrl = settings.openaiCodexUrl?.trim();
    if (!baseUrl) {
      return { ok: false, message: "OpenAI Codex URL is empty." };
    }

    const response = await requestUrl({
      url: `${baseUrl}/health`,
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      return { ok: false, message: `OpenAI Codex bridge health check failed (${response.status}).` };
    }

    return { ok: true, message: "OpenAI Codex bridge health check passed." };
  }

  async disconnect(settings: ChatGPT_MDSettings, saveSettings: () => Promise<void>): Promise<void> {
    settings.openaiCodexAccessToken = "";
    settings.openaiCodexRefreshToken = "";
    settings.openaiCodexAccessTokenExpiresAt = 0;
    this.pendingFlow = null;
    await saveSettings();
    new Notice("OpenAI Codex OAuth disconnected.", 6000);
  }

  private validateOauthSettings(settings: ChatGPT_MDSettings): void {
    const required = [
      ["openaiCodexOAuthAuthorizeUrl", settings.openaiCodexOAuthAuthorizeUrl],
      ["openaiCodexOAuthTokenUrl", settings.openaiCodexOAuthTokenUrl],
      ["openaiCodexOAuthClientId", settings.openaiCodexOAuthClientId],
      ["openaiCodexOAuthRedirectUri", settings.openaiCodexOAuthRedirectUri],
    ] as const;

    for (const [key, value] of required) {
      if (!value || !value.trim()) {
        throw new Error(`Missing required OpenAI Codex OAuth setting: ${key}`);
      }
    }

    validateUrl(settings.openaiCodexOAuthAuthorizeUrl);
    validateUrl(settings.openaiCodexOAuthTokenUrl);
    validateUrl(settings.openaiCodexOAuthRedirectUri);
  }

  private buildAuthorizationUrl(settings: ChatGPT_MDSettings, state: string, codeChallenge: string): string {
    const authorizeUrl = new URL(settings.openaiCodexOAuthAuthorizeUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", settings.openaiCodexOAuthClientId.trim());
    authorizeUrl.searchParams.set("redirect_uri", settings.openaiCodexOAuthRedirectUri.trim());
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    if (settings.openaiCodexOAuthScopes?.trim()) {
      authorizeUrl.searchParams.set("scope", settings.openaiCodexOAuthScopes.trim());
    }

    return authorizeUrl.toString();
  }

  private openInBrowser(url: string): void {
    const win = globalThis.window as Window | undefined;
    if (win?.open) {
      win.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    throw new Error("Could not open browser. Please copy the OpenAI Codex OAuth URL manually.");
  }

  private canAutoCaptureCallback(redirectUri: string): boolean {
    try {
      const parsed = new URL(redirectUri);
      const host = parsed.hostname;
      return parsed.protocol === "http:" && (host === "127.0.0.1" || host === "localhost") && this.hasNodeHttp();
    } catch {
      return false;
    }
  }

  private hasNodeHttp(): boolean {
    try {
      const nodeRequire = (globalThis as any).require;
      return !!nodeRequire?.("http");
    } catch {
      return false;
    }
  }

  private waitForOAuthCallback(
    redirectUri: string,
    expectedState: string,
    timeoutMs: number
  ): Promise<URLSearchParams> {
    return new Promise((resolve, reject) => {
      const nodeRequire = (globalThis as any).require;
      const http = nodeRequire("http");
      const parsedRedirect = new URL(redirectUri);
      const hostname = parsedRedirect.hostname;
      const port = Number(parsedRedirect.port || 80);
      const pathname = parsedRedirect.pathname || "/";

      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const server = http.createServer((req: any, res: any) => {
        try {
          const reqUrl = new URL(req.url || "/", `http://${hostname}:${port}`);
          if (reqUrl.pathname !== pathname) {
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }

          const params = reqUrl.searchParams;
          const state = params.get("state");

          if (!state || state !== expectedState) {
            res.statusCode = 400;
            res.end("OAuth state mismatch");
            finish(() => {
              server.close();
              reject(new Error("OpenAI Codex OAuth state mismatch"));
            });
            return;
          }

          if (params.get("error")) {
            const err = params.get("error_description") || params.get("error") || "OpenAI Codex OAuth failed";
            res.statusCode = 400;
            res.end("OpenAI Codex OAuth failed");
            finish(() => {
              server.close();
              reject(new Error(err));
            });
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(
            "<html><body><h2>OpenAI Codex OAuth complete</h2><p>You can close this tab and return to Obsidian.</p></body></html>"
          );

          finish(() => {
            server.close();
            resolve(params);
          });
        } catch (error: any) {
          finish(() => {
            server.close();
            reject(error);
          });
        }
      });

      const timeout = setTimeout(() => {
        finish(() => {
          server.close();
          reject(new Error("OpenAI Codex OAuth callback timed out"));
        });
      }, timeoutMs);

      server.listen(port, hostname, () => {
        // listener started
      });

      server.on("error", (error: Error) => {
        clearTimeout(timeout);
        finish(() => reject(error));
      });

      server.on("close", () => {
        clearTimeout(timeout);
      });
    });
  }

  private async exchangeAndSaveToken(
    callbackParams: URLSearchParams,
    settings: ChatGPT_MDSettings,
    saveSettings: () => Promise<void>
  ): Promise<void> {
    const code = callbackParams.get("code");
    const state = callbackParams.get("state");

    if (!code) {
      throw new Error("OpenAI Codex OAuth callback missing authorization code");
    }

    if (!state || !this.pendingFlow || state !== this.pendingFlow.state) {
      throw new Error("OpenAI Codex OAuth state mismatch or expired flow state");
    }

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", settings.openaiCodexOAuthRedirectUri.trim());
    form.set("client_id", settings.openaiCodexOAuthClientId.trim());
    form.set("code_verifier", this.pendingFlow.codeVerifier);

    if (settings.openaiCodexOAuthClientSecret?.trim()) {
      form.set("client_secret", settings.openaiCodexOAuthClientSecret.trim());
    }

    const response = await requestUrl({
      url: settings.openaiCodexOAuthTokenUrl.trim(),
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      headers: {
        Accept: "application/json",
      },
      body: form.toString(),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`OpenAI Codex OAuth token exchange failed (${response.status})`);
    }

    const tokenResponse = response.json as OAuthTokenResponse;
    if (!tokenResponse?.access_token) {
      throw new Error("OpenAI Codex OAuth token exchange did not return access_token");
    }

    settings.openaiCodexAccessToken = tokenResponse.access_token;

    if (tokenResponse.refresh_token) {
      settings.openaiCodexRefreshToken = tokenResponse.refresh_token;
    }

    const expiresInSeconds = Number(tokenResponse.expires_in || 0);
    settings.openaiCodexAccessTokenExpiresAt = expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : 0;

    this.pendingFlow = null;
    await saveSettings();
  }

  private generateRandomString(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }

  private async createCodeChallenge(codeVerifier: string): Promise<string> {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return this.base64UrlEncode(new Uint8Array(digest));
  }

  private base64UrlEncode(bytes: Uint8Array): string {
    const binary = String.fromCharCode(...bytes);
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}
