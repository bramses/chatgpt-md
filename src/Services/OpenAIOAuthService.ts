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

export class OpenAIOAuthService {
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

    const autoCaptureSupported = this.canAutoCaptureCallback(settings.openaiOAuthRedirectUri);

    this.openInBrowser(authorizationUrl);

    if (!autoCaptureSupported) {
      new Notice(
        "OpenAI OAuth: Browser opened. After login, copy the full callback URL and paste it into 'Exchange Callback URL'.",
        10000
      );
      return;
    }

    new Notice("OpenAI OAuth: Browser opened. Waiting for callback...", 7000);

    const callbackParams = await this.waitForOAuthCallback(settings.openaiOAuthRedirectUri, state, 180000);
    await this.exchangeAndSaveToken(callbackParams, settings, saveSettings);

    new Notice("OpenAI OAuth connected. Access token saved.", 6000);
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

    new Notice("OpenAI OAuth token exchange complete.", 6000);
  }

  async refreshAccessTokenIfNeeded(settings: ChatGPT_MDSettings, saveSettings: () => Promise<void>): Promise<void> {
    if (settings.openaiAuthMode !== "oauth_bridge") {
      return;
    }

    const refreshToken = settings.openaiOAuthRefreshToken?.trim();
    const tokenUrl = settings.openaiOAuthTokenUrl?.trim();
    const clientId = settings.openaiOAuthClientId?.trim();

    if (!refreshToken || !tokenUrl || !clientId) {
      return;
    }

    const now = Date.now();
    const expiresAt = settings.openaiOAuthAccessTokenExpiresAt || 0;
    const refreshThresholdMs = 2 * 60 * 1000;

    if (expiresAt > now + refreshThresholdMs) {
      return;
    }

    const form = new URLSearchParams();
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", refreshToken);
    form.set("client_id", clientId);

    if (settings.openaiOAuthClientSecret?.trim()) {
      form.set("client_secret", settings.openaiOAuthClientSecret.trim());
    }

    if (settings.openaiOAuthScopes?.trim()) {
      form.set("scope", settings.openaiOAuthScopes.trim());
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
      throw new Error(`OAuth token refresh failed (${response.status})`);
    }

    const data = response.json as OAuthTokenResponse;
    if (!data?.access_token) {
      throw new Error("OAuth token refresh did not return access_token");
    }

    settings.openaiOAuthAccessToken = data.access_token;
    if (data.refresh_token) {
      settings.openaiOAuthRefreshToken = data.refresh_token;
    }

    const expiresInSeconds = Number(data.expires_in || 0);
    settings.openaiOAuthAccessTokenExpiresAt =
      expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : settings.openaiOAuthAccessTokenExpiresAt;

    await saveSettings();
  }

  async verifyCurrentToken(settings: ChatGPT_MDSettings): Promise<{ ok: boolean; message: string }> {
    const baseUrl = settings.openaiUrl?.trim();
    const token = settings.openaiOAuthAccessToken?.trim();

    if (!baseUrl) {
      return { ok: false, message: "OpenAI URL is empty." };
    }

    if (!token) {
      return { ok: false, message: "OAuth bridge token is empty." };
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
      return { ok: false, message: `Token check failed (${response.status}).` };
    }

    const modelCount = Array.isArray(response.json?.data) ? response.json.data.length : 0;
    return { ok: true, message: `Token valid. Found ${modelCount} models.` };
  }

  private validateOauthSettings(settings: ChatGPT_MDSettings): void {
    const required = [
      ["openaiOAuthAuthorizeUrl", settings.openaiOAuthAuthorizeUrl],
      ["openaiOAuthTokenUrl", settings.openaiOAuthTokenUrl],
      ["openaiOAuthClientId", settings.openaiOAuthClientId],
      ["openaiOAuthRedirectUri", settings.openaiOAuthRedirectUri],
    ] as const;

    for (const [key, value] of required) {
      if (!value || !value.trim()) {
        throw new Error(`Missing required OAuth setting: ${key}`);
      }
    }

    validateUrl(settings.openaiOAuthAuthorizeUrl);
    validateUrl(settings.openaiOAuthTokenUrl);
    validateUrl(settings.openaiOAuthRedirectUri);
  }

  private buildAuthorizationUrl(settings: ChatGPT_MDSettings, state: string, codeChallenge: string): string {
    const authorizeUrl = new URL(settings.openaiOAuthAuthorizeUrl);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", settings.openaiOAuthClientId.trim());
    authorizeUrl.searchParams.set("redirect_uri", settings.openaiOAuthRedirectUri.trim());
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    if (settings.openaiOAuthScopes?.trim()) {
      authorizeUrl.searchParams.set("scope", settings.openaiOAuthScopes.trim());
    }

    return authorizeUrl.toString();
  }

  private openInBrowser(url: string): void {
    const win = globalThis.window as Window | undefined;
    if (win?.open) {
      win.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    throw new Error("Could not open browser. Please copy the OAuth URL manually.");
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
              reject(new Error("OAuth state mismatch"));
            });
            return;
          }

          if (params.get("error")) {
            const err = params.get("error_description") || params.get("error") || "OAuth authorization failed";
            res.statusCode = 400;
            res.end("OAuth authorization failed");
            finish(() => {
              server.close();
              reject(new Error(err));
            });
            return;
          }

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(
            "<html><body><h2>ChatGPT MD OAuth complete</h2><p>You can close this tab and return to Obsidian.</p></body></html>"
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
          reject(new Error("OAuth callback timed out"));
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
      throw new Error("OAuth callback missing authorization code");
    }

    if (!state || !this.pendingFlow || state !== this.pendingFlow.state) {
      throw new Error("OAuth state mismatch or expired flow state");
    }

    const form = new URLSearchParams();
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("redirect_uri", settings.openaiOAuthRedirectUri.trim());
    form.set("client_id", settings.openaiOAuthClientId.trim());
    form.set("code_verifier", this.pendingFlow.codeVerifier);

    if (settings.openaiOAuthClientSecret?.trim()) {
      form.set("client_secret", settings.openaiOAuthClientSecret.trim());
    }

    const response = await requestUrl({
      url: settings.openaiOAuthTokenUrl.trim(),
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      headers: {
        Accept: "application/json",
      },
      body: form.toString(),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`OAuth token exchange failed (${response.status})`);
    }

    const tokenResponse = response.json as OAuthTokenResponse;
    if (!tokenResponse?.access_token) {
      throw new Error("OAuth token exchange did not return access_token");
    }

    settings.openaiAuthMode = "oauth_bridge";
    settings.openaiOAuthAccessToken = tokenResponse.access_token;
    settings.apiKey = "";

    if (tokenResponse.refresh_token) {
      settings.openaiOAuthRefreshToken = tokenResponse.refresh_token;
    }

    const expiresInSeconds = Number(tokenResponse.expires_in || 0);
    settings.openaiOAuthAccessTokenExpiresAt = expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : 0;

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
