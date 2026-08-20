# Knowledge importer

ChatGPT history -> immutable source archive -> semantic knowledge across many
Obsidian vaults. User documentation: `docs/chatgpt-knowledge-import.md`.

Opt-in: `knowledgeEnabled` gates command registration and the inbox watcher, and
nothing in here runs at plugin startup.

## Pipeline

```
ConversationIngestionAdapter -> NormalizedConversation -> ImportManifestService (change detection)
  -> ConversationNormalizer (Layer A, immutable archive)
  -> SemanticExtractorService (Layer B, model call)
  -> VaultRouterService (meaning -> vault + folder)
  -> SemanticNoteResolver (which durable note)
  -> KnowledgeWriterService (merge + provenance)
  -> KnowledgeIndexService (MOCs, Dream Atlas, review queue, import log)
```

`ImportCoordinator` owns everything that must not be duplicated per entry point:
phase order, resumability, idempotency, bounded concurrency, retry, abort and
run accounting. Do not add a second pipeline for "live" conversations - add an
adapter under `Sources/` instead.

## Epistemic invariants (personal vault)

See `docs/observatory-constitution.md` for the full mapping. The load-bearing ones:

- **Assistant text is never evidence about the user.** `classifyOrigin()` decides
  provenance from the transcript, not from the model. Assistant-grounded units
  become `assistant-interpretation`, are capped in confidence, and are excluded
  from independent-evidence counts. Removing this reintroduces an AI-on-AI echo
  chamber.
- **Repetition is not support.** `evidenceIndependence()` counts distinct
  conversations and clusters them into periods of reflection; every evidence
  block carries the frequency caveat.
- **Ordinary language.** Clinical vocabulary the person never used, and any
  essentializing phrasing, drops below the auto-file threshold via
  `guardLanguage()`.
- **Three layers.** `trace` (recorded), `garden` (provisional, dated, expiring),
  `horizon` (possibility). Garden material never inherits trace authority.
- **Models can die.** Concepts carry a `ModelLifecycle`; retired ones leave
  retrieval and the indexes but keep their evidence. The person's `status:` in a
  note always wins.
- **Some things are only preserved.** `fragment` and `strange-connection` units
  are written verbatim with no interpretation attached.
- **The vault can decline.** `detectRumination()` stops a looping question from
  producing another synthesis, and offers choices instead.

Do not add features that increase certainty, prediction, self-surveillance or
identity-freezing, however well they would work.

## Invariants

- **Layer A runs first, for every conversation, before any model call.** An
  interrupted run must never leave a conversation unpreserved.
- **The manifest is the source of truth**, keyed by ChatGPT conversation id plus
  content hash. Never key work off filenames.
- **Human-authored content wins.** Generated text lives only between
  `<!-- chatgpt-md:auto:start id=... -->` markers; frontmatter edits touch only
  the keys we own (`upsertFrontmatterFields`).
- **Evidence merges, never duplicates.** Every evidence line carries
  `<!-- unit:ID conv:ID -->`; re-runs merge on that id.
- **Projects stay projects.** `VaultRouterService.applyStructuralRules` keeps
  personal meaning out of project vaults and project work out of the personal
  vault, whatever the model suggested.
- **Nothing is discarded.** Low confidence means preserved + queued for review,
  never guessed into a topical note.
- **Interpretation is labeled.** Inferred statements are written tentatively and
  marked; no diagnoses, no "frequency proves significance".

## Plugin orchestration (per vault)

Obsidian plugins are vault-local. A global capability list would be wrong in
every direction, so:

- `PluginCapabilityRegistry` builds one cached profile per vault from
  `community-plugins.json`, `core-plugins.json` and `plugins/*/manifest.json`.
  Plugin *settings* are never read (they contain tokens).
- `PluginIntegrationService` answers `has(vaultId, capability)`. There is no
  `getDataview()`; the destination vault decides.
- `VaultEnhancementService` applies optional extras *after* the canonical note is
  complete. `Orchestration.test.ts` asserts the note body is byte-identical with
  and without capabilities - keep it that way.
- Nothing installs, enables, disables or copies plugin configuration. Missing
  capabilities are reported, never fixed.
- Discovery is cached (10 min TTL, explicit refresh) and never runs at startup.

## Files

| File | Role |
| --- | --- |
| `ChatGPTExportParser.ts` | Defensive parsing of the official export (mapping graph, branches, deleted nodes, unknown content types) |
| `ConversationNormalizer.ts` | Layer A: archive path, frontmatter, transcript, content hash |
| `ImportManifestService.ts` | Durable resumable state: conversations, concepts, review queue, runs |
| `SemanticExtractorService.ts` | Chunking + model call + tolerant schema parsing; provider-agnostic via an injected caller |
| `KnowledgePrompts.ts` | The extraction prompt and vault catalog rendering |
| `VaultRegistryService.ts` | Vault discovery (`obsidian.json`), registry merge, semantic profiles |
| `VaultRouterService.ts` | Meaning-based routing + confidence thresholds |
| `PersonalOntology.ts` | Default personal-vault folders and existing-folder reuse |
| `SemanticNoteResolver.ts` | Which durable note a unit belongs to |
| `KnowledgeWriterService.ts` | Managed-block writing, provenance, dreams, symbols |
| `KnowledgeIndexService.ts` | MOCs, Dream Atlas, review queue, import logs |
| `ImportCoordinator.ts` | Orchestration |
| `KnowledgeImportService.ts` | Facade used by command handlers; lazy init, inbox watcher |
| `KnowledgeFileStore.ts` | Obsidian / Node / memory / dry-run file stores |
| `NodeRuntime.ts`, `ZipReader.ts`, `SourceFileReader.ts` | Desktop-only filesystem, ZIP and input reading |
| `Sources/` | Ingestion adapters: official export, watch folder, live capture, source archive |

## Testing

Services take injected dependencies (`KnowledgeAiCaller`, `KnowledgeFileStore`)
so tests never touch the AI SDK or the disk. `MemoryVaultStore` backs the
in-memory vaults used by `ImportCoordinator.test.ts`, which covers the
end-to-end guarantees: split routing, idempotency, growth detection, resume,
review handling, dry run.

Keep new behavior covered by one of those guarantees rather than adding a
parallel code path.
