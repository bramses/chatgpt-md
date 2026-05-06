# OpenAI Codex OAuth Provider Roadmap

This roadmap is for a personal, local-only ChatGPT MD extension that uses the same broad Codex OAuth pattern as OpenClaw and Paperclip: sign in with a supported ChatGPT plan, keep Codex OAuth/session handling in a local runtime, and expose a narrow local provider to the Obsidian plugin.

This is not an attempt to use the OpenAI API for this provider. The existing OpenAI API-key support should remain intact, but the new extension path should be 100% Codex OAuth connected and exposed separately as `openai-codex`.

## Source Notes

- The Skywork article describes an OAuth 2.1 style authorization-code flow with PKCE, optional dynamic client registration, localhost callback capture, token exchange, refresh, and an OpenAI-compatible gateway surface.
- Official OpenAI API documentation still describes API keys as the supported authentication mechanism for direct OpenAI API calls.
- Official OpenAI documentation does describe OAuth for GPT Actions, but that flow is for ChatGPT authenticating to a third-party API, not for third-party local software authenticating to OpenAI's API with a ChatGPT subscription.
- Official Codex documentation says Codex is included with ChatGPT Plus, Pro, Business, Edu, and Enterprise plans, and Codex clients sign in with ChatGPT.
- OpenClaw and similar tools make Codex OAuth straightforward by treating it as a separate `openai-codex` auth/provider path rather than overloading the normal API-key `openai` path.
- Paperclip's Codex local adapter keeps Codex runtime/auth state in the local Codex CLI environment, with isolated runtime state when needed, instead of embedding the auth details in every client workflow.

Implication: keep the plugin's direct OpenAI API path API-key based, but build this extension as a separate Codex OAuth provider backed by supported ChatGPT plans such as Plus and Pro.

## Current Repo State

The repo already has the first layer of OAuth bridge support:

- `src/Services/OpenAIOAuthService.ts` implements PKCE challenge creation, browser launch, localhost callback capture, token exchange, refresh-token renewal, and token verification.
- `src/Models/Config.ts` has settings for OAuth mode, endpoints, client id, scopes, redirect URI, access token, refresh token, and expiry.
- `src/Views/ChatGPT_MDSettingsTab.ts` exposes OAuth settings and buttons for connect, manual callback exchange, and token verification.
- `src/Services/ApiAuthService.ts` uses the stored OAuth access token when `openaiAuthMode` is `oauth_bridge`.
- `src/Commands/ChatHandler.ts`, `src/Commands/InferTitleHandler.ts`, and `src/Commands/ModelSelectHandler.ts` refresh the token before use.
- `src/Services/Adapters/OpenAIAdapter.ts` can fetch models from a custom OpenAI-compatible gateway in OAuth bridge mode.

This means the existing OAuth bridge code is useful scaffolding, but the product shape should become `openai-codex`, not "OpenAI API with OAuth."

## Target Architecture

Use three layers:

1. Obsidian plugin
   - Owns user settings, chat UI, model selection, vault context, tool approvals, and OpenAI-compatible HTTP requests.
   - Does not scrape browser cookies, store account passwords, or rely on hidden web session internals.
   - Treats Codex OAuth bridge usage as a distinct provider path, eventually exposed as `openai-codex@model` in ChatGPT MD frontmatter.

2. Local OAuth bridge
   - Runs only on loopback.
   - May be addressed as `openai-codex.local` for compatibility with PaperCLI/OpenClaw conventions, but that host must resolve to loopback (`127.0.0.1` or `::1`).
   - Owns Codex OAuth login for supported ChatGPT plans, including Plus and Pro.
   - Stores sensitive refresh/session material outside the vault.
   - Exposes a narrow OpenAI-compatible API to the plugin, for example `/v1/models` and chat/responses endpoints.

3. Upstream provider
   - Codex access through a signed-in ChatGPT account on a supported plan.
   - Direct OpenAI API access remains a separate API-key provider and is not part of this extension path.

## Phase 0: Ground Rules and Risk Gate

Goal: avoid building something that is brittle, unsafe, or accidentally redistributable.

Tasks:

- Decide this remains local-only and personal-use only.
- Add a visible explanation in settings that `openai-codex` is a local Codex OAuth provider for supported ChatGPT plans, separate from OpenAI API-key mode.
- Do not ship provider-specific unofficial endpoints or client credentials in the public plugin.
- Do not store access tokens, refresh tokens, callback URLs, or authorization codes in notes or frontmatter.
- Require localhost URLs for the default bridge preset.
- Allow `openai-codex.local` only as a loopback alias, not as a general LAN host.
- Document that OpenAI API-key auth remains available, but this provider intentionally does not use it.

Exit criteria:

- You can explain exactly which component owns Codex OAuth behavior: the local bridge/runtime, not the Obsidian plugin.
- The plugin can be safely published without embedding private or unofficial provider details.

## Phase 1: Define the Bridge Contract

Goal: make the plugin and bridge meet through a boring, testable HTTP contract.

Minimum bridge endpoints:

- `GET /v1/models`
- `POST /v1/chat/completions` if keeping the current chat-completions path
- `POST /v1/responses` only if the plugin later moves to Responses API semantics
- `GET /health`
- Optional: `GET /.well-known/oauth-protected-resource` for discovery if the bridge implements it

Minimum auth behavior:

- Plugin sends `Authorization: Bearer <bridge access token>`.
- Bridge validates or maps that token locally.
- Bridge handles upstream refresh/session renewal.
- Bridge returns OpenAI-compatible error bodies where possible.

Minimum diagnostics:

- `401`: missing or expired local bridge token
- `403`: bridge is authenticated but upstream subscription/session lacks access
- `429`: upstream or bridge rate limit
- `502`: upstream provider failure
- `503`: bridge not logged in

Provider identity:

- Use `openai-codex` as the bridge/provider identity.
- In ChatGPT MD, the matching model id should be `openai-codex@<model>` to fit the plugin's existing `provider@model` convention.
- The bridge may expose upstream-style names internally, but the plugin should preserve the provider distinction so OpenAI API-key traffic and Codex OAuth traffic cannot be confused.

Exit criteria:

- Plugin can verify the bridge with `/health`.
- Plugin can list models with `/v1/models`.
- Plugin can send a single non-streaming chat request through the bridge.

## Phase 2: Harden Plugin OAuth Settings

Goal: make the existing OAuth mode less footgun-shaped.

Tasks:

- Add an `OpenAI Codex Base URL` instead of reusing `OpenAI URL`.
- Add a preset button for local bridge defaults:
  - `OpenAI Codex URL`: `http://openai-codex.local:<port>` when loopback resolution can be verified
  - Fallback `OpenAI Codex URL`: `http://127.0.0.1:<port>`
  - `Redirect URI`: `http://127.0.0.1:<callback-port>/callback`
  - Scopes: bridge-defined, not hard-coded as OpenAI official scopes
- Validate bridge URLs:
  - Accept `127.0.0.1`, `localhost`, and `openai-codex.local`.
  - For `openai-codex.local`, verify or document that it must resolve to loopback.
  - Warn if the host is not `127.0.0.1`, `localhost`, or verified `openai-codex.local`.
  - Block plain `http` for non-localhost.
  - Warn before saving tokens when the bridge URL points outside the local machine.
- Hide or mask stored access and refresh tokens in settings.
- Add a disconnect button that clears OAuth access token, refresh token, expiry, and pending callback state.
- Add clearer status text:
  - Not configured
  - Waiting for callback
  - Connected, expires at local time
  - Refresh failed, reconnect required

Exit criteria:

- A user can configure a local bridge without reading the code.
- A user can clear all OAuth bridge credentials from the plugin UI.

## Phase 3: Make Callback Capture Reliable

Goal: make login recoverable when ports, redirects, or Obsidian desktop quirks get in the way.

Tasks:

- Before starting OAuth, check whether the callback port is available and show a clear error if not.
- Support a generated per-login state and PKCE verifier, already present, but add expiry cleanup.
- Persist pending flow state only if needed for manual callback exchange; otherwise keep it in memory.
- Add a copyable authorization URL fallback if `window.open` fails.
- Improve the local callback success page with no secrets printed.
- Add tests for:
  - PKCE challenge format
  - state mismatch rejection
  - callback error handling
  - token exchange body construction
  - refresh threshold behavior

Exit criteria:

- Login succeeds with auto-capture on desktop.
- Manual callback exchange succeeds when auto-capture is unavailable.
- Failed or stale login attempts do not leave reusable pending state behind.

## Phase 4: Token Storage and Security

Goal: reduce damage if the Obsidian vault or plugin data file is copied.

Tasks:

- Prefer storing long-lived refresh/session material in the local bridge, not in Obsidian settings.
- In the plugin, store only the shortest-lived token needed to call the local bridge.
- If refresh tokens remain in plugin settings, add documentation warning that Obsidian plugin data is local plaintext unless the platform or vault setup protects it.
- Avoid logging tokens, callback URLs, authorization codes, or complete request headers.
- Redact tokens from errors and debug output.
- Add a `debugMode` helper that redacts `Authorization`, `access_token`, `refresh_token`, `code`, and `state`.

Exit criteria:

- Turning on debug mode cannot leak OAuth secrets into the console.
- Bridge disconnect or plugin disconnect removes local plugin tokens.

## Phase 5: Request Compatibility

Goal: confirm the bridge can support the plugin's actual payloads.

Tasks:

- Inventory current request path from editor frontmatter to provider call.
- Confirm whether ChatGPT MD uses AI SDK chat completions, OpenAI-compatible providers, tool calls, and streaming in ways the bridge supports.
- Build a small compatibility matrix:
  - non-streaming text chat
  - streaming text chat
  - tool/function calling
  - model listing
  - title inference
  - abort/stop streaming
- Add bridge-specific handling for unsupported features:
  - disable tool calling for bridge models until verified
  - show a clear notice for unsupported streaming or response formats
  - allow per-note model override for bridge models
  - keep `openai@...` API-key models and `openai-codex@...` OAuth models separate in model selection

Exit criteria:

- At least non-streaming chat, streaming chat, model listing, and title inference work through the bridge.
- Unsupported features fail with readable messages instead of silent empty responses.

## Phase 6: Local Gateway Implementation Plan

Goal: build or adapt the local process that owns experimental OAuth behavior.

Recommended shape:

- Separate local app or CLI, not inside the Obsidian plugin bundle.
- Binds only to loopback, preferably `127.0.0.1`.
- Supports `openai-codex.local` as a local alias for compatibility with PaperCLI/OpenClaw.
- Has its own config directory outside the vault.
- Provides `/health`, `/v1/models`, and the needed generation endpoint.
- Owns upstream OAuth login, refresh, and upstream request translation.
- Exposes only a local bearer token to the plugin.

Security requirements:

- Refuse `0.0.0.0` by default.
- Refuse non-loopback `openai-codex.local` resolution.
- Require a local bearer token even on localhost.
- Never accept arbitrary remote origins for browser-facing endpoints.
- Keep CORS locked down or disabled unless explicitly needed.
- Do not expose filesystem or shell tools from the bridge.

Exit criteria:

- `curl http://openai-codex.local:<port>/health` returns bridge status without secrets.
- `curl -H "Authorization: Bearer <token>" http://openai-codex.local:<port>/v1/models` returns a model list.
- The same checks work with `127.0.0.1` as a fallback.
- ChatGPT MD can use the bridge as its OpenAI Codex provider URL.

## Phase 7: User Flow

Goal: make the path from zero to first chat boring.

Desired flow:

1. Start local bridge.
2. In Obsidian settings, choose the `openai-codex` provider.
3. Click `Use Local Bridge Defaults`.
4. Click `Connect`.
5. Browser opens for bridge-managed login.
6. Callback returns to localhost.
7. Plugin stores only the bridge token or short-lived access token.
8. Click `Verify`.
9. Select a bridge model.
10. Run `ChatGPT MD: Chat`.

Failure states to design:

- Bridge is not running.
- Callback port is already in use.
- Login expires.
- Refresh fails.
- Model is unavailable.
- Streaming response format is incompatible.
- Upstream returns rate/usage limit.

Exit criteria:

- Each failure state has a user-readable Notice and a next action.

## Phase 8: Tests and Manual Verification

Automated tests:

- OAuth service unit tests with mocked `requestUrl`.
- Settings migration tests for new OAuth fields.
- OpenAI adapter tests for local bridge model listing.
- Error-redaction tests.
- Development mock bridge smoke test with `yarn dev:codex-bridge`.

Manual tests:

- Fresh settings, API-key mode still works.
- `openai-codex` mode with bridge down shows a useful error.
- Codex OAuth connect succeeds.
- Token refresh happens before expiry.
- Disconnect clears plugin-held tokens.
- Model select includes bridge models.
- Chat, title inference, and stop streaming behave correctly.

Dev bridge smoke test:

1. Run `yarn dev:codex-bridge`.
2. In OpenAI Codex settings, set:
   - `API URL`: `http://127.0.0.1:1455`
   - `OAuth Authorize URL`: `http://127.0.0.1:1455/oauth/authorize`
   - `OAuth Token URL`: `http://127.0.0.1:1455/oauth/token`
   - `OAuth Redirect URI`: `http://127.0.0.1:8766/callback`
3. Click `Connect OpenAI Codex`.
4. Click `Health` and `Models`.
5. Use `model: openai-codex@gpt-5.2-codex` in note frontmatter and run `ChatGPT MD: Chat`.

Exit criteria:

- `yarn test`
- `yarn build`
- Manual first-chat checklist passes in a disposable vault.

## Phase 9: Documentation

Tasks:

- Add a README section that distinguishes:
  - direct OpenAI API key mode
  - local model mode
  - local `openai-codex` OAuth mode for supported ChatGPT plans
- Add a local-only warning.
- Add setup steps for the bridge contract, without embedding unofficial provider secrets or endpoints.
- Add troubleshooting for `401`, `403`, callback timeout, and bridge offline.
- Add a "How to remove credentials" section.

Exit criteria:

- A future you can reinstall the plugin and bridge from scratch using only the docs.

## Suggested Build Order

1. Tighten settings UX and warnings.
2. Add disconnect and token redaction.
3. Add `/health` bridge verification.
4. Define bridge error handling.
5. Add OAuth service tests.
6. Build or adapt the local bridge.
7. Verify model listing.
8. Verify chat without streaming.
9. Verify streaming.
10. Verify tool calling only after the basic chat path is stable.

## Architecture Decisions

- The local bridge owns Codex OAuth for supported ChatGPT plans. ChatGPT MD should only authenticate to the local bridge, or receive a local bridge token from it.
- The canonical bridge hostname is `openai-codex.local` for compatibility with PaperCLI/OpenClaw. It must resolve to loopback. `127.0.0.1` remains the fallback and the safest default during debugging.
- The bridge should expose both `/v1/chat/completions` and `/v1/responses` over time, but `/v1/chat/completions` is the first milestone because it matches the current plugin's OpenAI-compatible path.
- Plugin-held refresh tokens should be eliminated for this mode. The bridge should hold upstream refresh/session material; the plugin should hold only a revocable local bearer token or short-lived bridge access token.
- Bridge models should use a distinct `openai-codex@model` id in ChatGPT MD. This mirrors OpenClaw's `openai-codex/model` distinction while fitting this plugin's `provider@model` syntax.
- `openai-codex` mode starts with model listing, non-streaming chat, streaming chat, and title inference. Tool calling can be enabled only after explicit compatibility testing. Web search and vault tools remain plugin-owned and should not move into the bridge.
- The bridge should not expose shell, filesystem, or vault operations. Its job is auth/session mediation and OpenAI-compatible request translation only.

## Parity Check With Paperclip/OpenClaw

The roadmap now matches the important parts of those tools:

- Browser or device OAuth is owned by the Codex/local runtime path, not by manually pasting API keys into every workflow.
- Codex OAuth is a distinct provider identity: OpenClaw uses `openai-codex/...`; ChatGPT MD should use `openai-codex@...`.
- Local runtime state is kept outside project content. Paperclip does this through Codex CLI runtime state and isolated `CODEX_HOME` when needed; this roadmap keeps bridge/session material outside the Obsidian vault.
- There is a local gateway/adapter boundary. OpenClaw routes through its provider/gateway machinery; this roadmap routes Obsidian through `openai-codex.local`.
- Direct OpenAI API-key usage remains separate from Codex OAuth usage. This extension path should not call `api.openai.com` with a normal OpenAI API key.

One deliberate difference: ChatGPT MD should start with a narrow OpenAI-compatible HTTP bridge instead of trying to become a full coding-agent runtime. Vault tools, approvals, and note workflows stay in the plugin; Codex OAuth/session translation stays in the bridge.

## Recommendation

Do not put Codex OAuth/session internals directly into ChatGPT MD. The plugin should grow a distinct `openai-codex` provider that talks to a local Codex OAuth bridge at `openai-codex.local`, while the bridge handles supported-plan sign-in and session refresh. The existing OpenAI API-key provider stays intact, but it is not the path for this extension.
