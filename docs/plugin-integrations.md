# Plugin Integrations

How the knowledge system cooperates with the rest of your Obsidian setup.

Two rules govern everything here:

1. **Plugins are per vault.** Obsidian keeps plugins vault-local, so capability
   detection is per vault, and the destination vault decides what a note gets.
2. **Nothing optional is load-bearing.** The canonical note - frontmatter,
   wikilinks, provenance, evidence - is written before any enhancement runs and
   is byte-identical whether the destination has thirty plugins or none.

Nothing is ever installed, enabled, disabled, configured or copied between
vaults by this plugin. It observes; you decide.

---

## How it works

```
semantic unit
   -> determine meaning
   -> select destination vault            (VaultRouterService)
   -> load that vault's capability profile (PluginCapabilityRegistry, cached)
   -> write canonical Markdown            (KnowledgeWriterService)
   -> apply optional enhancements         (VaultEnhancementService)
```

The capability profile is built from what Obsidian itself records:

| Read | Why |
| --- | --- |
| `<vault>/.obsidian/community-plugins.json` | which community plugins are **enabled** |
| `<vault>/.obsidian/core-plugins.json` | which core plugins are enabled (canvas, daily notes, templates, backlinks) |
| `<vault>/.obsidian/plugins/*/manifest.json` | what is **installed**, plus name and version |
| `<vault>/.obsidian/daily-notes.json` | daily-note folder and format, when linking captures |
| `<vault>/.git/config` | remote URLs, for the safety warning only |

Plugin **settings** files are never read: they routinely contain tokens.

A plugin listed as enabled but missing from disk is treated as unavailable. An
unknown plugin is recorded for visibility with no integration attempted.

Profiles are cached for ten minutes and refreshed on demand
(**Refresh plugin capabilities**), so writing a note never rescans `.obsidian`.

---

## Integration status

| Plugin | Role | Integration | Required? | Status |
| --- | --- | --- | --- | --- |
| Dataview | Query layer | Consistent frontmatter; live queries in generated indexes where enabled, generated lists otherwise | No | Implemented |
| Templater | Note creation | Optional template files matching the generated schemas; Templater date syntax only where enabled | No | Implemented (explicit command) |
| QuickAdd | Fast capture | Capture commands QuickAdd can bind to; they also work standalone | No | Implemented |
| Tasks | Actions | Plain `- [ ]` checkboxes always; live `tasks` query blocks only where enabled | No | Implemented |
| TaskNotes | Richer tasks | Same checkbox syntax; task entities may link to knowledge notes | No | Compatible, no coupling |
| Checklist | Actions | Same checkbox syntax | No | Compatible, no coupling |
| Calendar | Temporal navigation | Dates come from the sources; Calendar navigates them | No | Compatible |
| Daily Notes (core) | Temporal layer | Lightweight links under a managed "Knowledge captured" block. Never conversation dumps, never creates daily notes during a bulk import | No | Implemented |
| Omnisearch | Full-text search | Readable Markdown, clear titles, aliases; no JSON blobs in notes | No | Implemented by design |
| Smart Connections | Semantic discovery | Reported as a capability; never used to merge concepts | No | Deliberately advisory only |
| Backlinks (core) | Graph | Meaningful `[[wikilinks]]` from dreams, people, sources, concepts | No | Implemented by design |
| Canvas (core) | Visual thinking | Curated generated views in `99 System/Canvases/` only | No | Implemented (explicit command) |
| Excalidraw | Visual thinking | Links and embeds authored by you | No | Intentionally not automated |
| Mind Map / MarkMind | Structure view | Sane heading hierarchy in generated notes | No | Implemented by design |
| Outliner | List editing | Clean nested lists, no malformed indentation | No | Implemented by design |
| Advanced Tables | Tables | Standard Markdown tables where tabular data helps | No | Implemented by design |
| PDF++ | Source annotation | `Capture source annotation` keeps the author's words and your reading in separate sections, with a source reference | No | Implemented |
| Importer | External data | Imported Markdown can be fed to the pipeline later | No | Interface only |
| Git | Versioning | Read-only safety check: warns when a personal vault pushes to a public remote | No | Implemented |
| LiveSync / Remotely Save / Google Drive Sync | Sync | Detects several bidirectional sync plugins in one vault and warns | No | Diagnostics only |
| Local REST API / MCP | External agents | In-process `knowledgeApi` other plugins can call. No port opened; writes gated by a setting | No | Implemented |
| Claudian | AI interface | Home and per-vault context notes so the vault is the memory | No | Implemented |
| Copilot | AI interface | Same, client-agnostic | No | Implemented |
| Iconize | Visual metadata | Optional `icon:` frontmatter for known note types; decoration only | No | Implemented |
| Highlightr | Presentation | Manual formatting preserved; generated content stays inside managed blocks | No | Implemented by design |
| Homepage | Entry point | `Knowledge Home` is offered as a target; your Homepage setting is never changed | No | Recommendation only |
| make.md | Navigation | No dependency on proprietary metadata | No | Deliberately not coupled |
| Better Word Count | Statistics | Generated content is confined to marked blocks | No | Implemented by design |
| Recent Files | Navigation | Background writes never open notes in the UI | No | Implemented by design |
| Editing Toolbar / Style Settings / Minimal | Editing and theme | Ordinary Markdown, no custom editor state, no theme manipulation | No | Deliberately untouched |
| Terminal | Automation | Commands are available in the palette; no daemon is added | No | Not coupled |

---

## Commands

| Command | What it does |
| --- | --- |
| Plugin integration status | Per-vault capability report. Scans on open. |
| Refresh plugin capabilities | Rescan every vault now. |
| Open knowledge home | Rebuild and open the entry note for the personal vault. |
| Write knowledge system status note | Per-vault status into `99 System/Knowledge System Status.md`. |
| Generate knowledge canvases | Curated Canvas views (skipped where Canvas is off). |
| Install knowledge note templates | Templates matching the generated schemas. Never overwrites. |
| Create project vault context notes | `HOME`, `PROJECT CONTEXT`, `CURRENT STATE`, `DECISIONS` for project vaults, only when missing. |
| Validate knowledge graph | Structural check: registry versus disk. No AI, no network, no writes. |
| Capture idea / dream / memory / person / song idea / question / book / film / project decision / something I learned / source annotation | Manual capture into the same structure the importer uses. |

---

## Frontmatter schemas

Generated and hand-made notes share these shapes, which is what makes Dataview
queries work across both.

```yaml
# concept / pattern
type: concept
layer: garden            # trace | garden | horizon
epistemic_status: provisional
status: emerging         # emerging | active | quiet | dormant | historical | contradicted | retired
first_observed: 2024-01-01
last_observed: 2026-02-02
independent_sources: 3
reflection_episodes: 2
assistant_originated_evidence: 0
expires_for_review: 2026-08-01
source_conversations: [...]
```

```yaml
# dream
type: dream
layer: trace
date: 2025-07-07
people: []
places: []
symbols: []
emotions: []
themes: []
source_conversations: [...]
```

```yaml
# person
type: person
layer: trace
aliases: []
```

```yaml
# project knowledge
type: project-knowledge
layer: garden
source_vault: Mybrain.Leander     # cross-vault provenance
source_path: 90 ChatGPT Sources/2026/...
```

Example Dataview queries:

```dataview
TABLE first_observed, last_observed, independent_sources
FROM "03 Patterns"
WHERE type = "concept" AND status != "retired"
SORT last_observed DESC
```

```dataview
LIST
FROM "04 Dreams"
WHERE contains(symbols, "Heavy legs")
```

Dataview is a *view*. Markdown and frontmatter remain canonical.

---

## The knowledge API

When the importer is enabled, the plugin instance exposes `knowledgeApi`:

```js
const api = app.plugins.plugins["chatgpt-md"].knowledgeApi;

await api.status();                       // counts, last run
await api.vaults();                       // vaults and their capabilities
await api.search("uncertainty", { limit: 10 });
await api.read("03 Patterns/Control.md");
await api.previewRouting("profile architecture");
await api.capture("idea", "A small EP");  // refused unless writes are enabled
```

Constraints, by design:

- **No port is opened.** Local REST API or an MCP server carries it, under
  whatever permissions you configured there.
- **Writes are off by default** (*Allow External Captures*).
- `read` refuses `.obsidian`, `.git`, `.json` and any path traversal; only
  Markdown and canvases can be read.
- Settings, API keys and manifest internals are never returned.

---

## Graceful degradation

| Removed | What remains |
| --- | --- |
| Dataview | Every index keeps its generated list; queries were an addition, never the content |
| Tasks / TaskNotes / Checklist | Plain `- [ ]` checkboxes |
| QuickAdd | The capture commands themselves |
| Templater | Templates are plain Markdown with placeholders |
| Smart Connections | Routing and resolution never used it |
| Omnisearch | Obsidian search, over deliberately readable notes |
| Canvas | The notes the canvas pointed at |
| Excalidraw | The links you wrote |
| PDF++ | The source reference in frontmatter |
| Iconize | One decorative frontmatter key |
| Git / sync plugins | Nothing; they were only ever inspected |
| Claudian / Copilot / MCP | The vault, which was always the memory |
| **Every plugin** | A complete Markdown vault with frontmatter, wikilinks and provenance |

Verified in `Orchestration.test.ts`: the note body written for a fully equipped
vault and for a bare one is byte-identical.

---

## Performance

- No scan at startup. Capability discovery happens on first use of an importer
  command and is cached (10 minutes, or until you refresh).
- Discovery reads a handful of small JSON files per vault, bounded to 200 plugin
  folders. No AI calls, no vault-wide scan.
- Writing a note reads a cached profile from memory.
- Background imports never open notes in the UI and never create daily notes.

## Privacy

- Capability discovery reads plugin *manifests* and enabled-lists only, never
  plugin settings.
- Nothing about your plugins or vault is sent anywhere. The only outbound data
  is what the importer sends to the AI provider you configured.
- Git remotes are inspected read-only and shown with credentials stripped.
- Multiple sync plugins produce a warning, never a configuration change.
