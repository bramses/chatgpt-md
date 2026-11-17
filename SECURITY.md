# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories for `bramses/chatgpt-md`. Do not open a public issue for an approval bypass, credential leak, or unintended vault-data disclosure.

Include the affected plugin and Obsidian versions, provider, reproduction steps, and sanitized configuration. Never include real API keys or private note contents.

Security-sensitive reports include:

- bypassing tool execution or result-selection approval;
- sending unselected vault or web data to a model;
- exposing API keys in logs, errors, or requests to the wrong provider;
- provider/base-URL confusion that sends data or credentials to an unintended host;
- unsafe handling of linked notes, custom search endpoints, or plugin data;
- exploitable dependency vulnerabilities.

The maintainers will acknowledge and triage reports as availability permits and coordinate disclosure after a fix is available.

## Data and credential model

- Secure mode requires both Obsidian's vault-local `SecretStorage` and native secret settings control. Runtime capability detection, rather than an Obsidian version check, determines the mode.
- In secure mode, provider and web-search secrets are managed by Obsidian. Plugin `data.json` stores opaque references only after successful migration.
- Plaintext keys migrate on plugin load and retry when settings opens. A failed storage or persistence step retains the plaintext key for authentication and later retry.
- A plaintext copy beside a valid reference is removed only through the explained **Delete insecure copy** action and only after persistence succeeds.
- Replacing or clearing a reference does not delete the old Obsidian credential; its lifecycle remains user-managed.
- If either secure capability is unavailable, the plugin uses its legacy plaintext fields and controls. A downgrade after migration may require keys to be re-entered; reference IDs are never used as credentials.
- Cloud-provider chats send conversation text and expanded linked-note content to the selected provider.
- Ollama and LM Studio remain local only when their configured URLs point to local services.
- AI tools require approval before execution. Vault and web-search results require selection before their content is sent back to the model.
- Custom web-search endpoints receive the search query and, when configured, a bearer credential.
- The opt-in Parallel search provider sends only the approved public query and a fixed objective to its Unified MCP server, without search credentials, note bodies, or chat history. Only selected source titles, URLs, and excerpts enter the continuation context.
- Debug logs are designed not to include credentials, prompts, note bodies, or tool-result contents. Review and sanitize logs before sharing them.
