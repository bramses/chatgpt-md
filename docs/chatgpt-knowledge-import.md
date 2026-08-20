# ChatGPT History Knowledge Import

Import your complete ChatGPT history into Obsidian, preserve every conversation
unchanged, and route the meaning inside it into the right vaults.

The importer is **off by default**. Nothing runs, nothing is registered, and no
extra work happens at startup until you enable it in
**Settings -> ChatGPT MD -> Knowledge Importer**.

---

## The two layers

**Layer A - the source archive (immutable).**
Every conversation in your export becomes one Markdown note with full
provenance frontmatter and the complete transcript. This is evidence. It is
written before any model call happens, and it is never rewritten by later runs
except to flip its `processed` flag.

**Layer B - the knowledge layer (durable, merged).**
Each conversation is split into *semantic units* - one insight, decision,
dream, pattern, person or reference each. Every unit is routed independently to
the vault it belongs to and merged into a durable note there, with a dated
evidence line pointing back to the archived source.

```
ChatGPT export
      |
      v
ingestion adapter -> normalized conversation -> change detection
      |
      +--> source archive (Layer A)
      |
      +--> semantic extraction -> vault routing -> note resolution
                                                        |
                                                        v
                             merged into durable notes, with provenance
```

One conversation can produce a Clarity backend decision, a personal pattern and
a film recommendation - three units, three destinations, one archived source.

---

## 1. Export your ChatGPT data

1. ChatGPT -> **Settings -> Data controls -> Export data**.
2. Confirm, then wait for the email from OpenAI.
3. Download the ZIP. It contains `conversations.json` plus `chat.html` and some
   metadata files.

You can point the importer at either the **ZIP** or at **`conversations.json`**
extracted from it. ZIP reading is desktop-only (it uses Node's zlib); on mobile,
extract `conversations.json` and place it inside your vault.

## 2. Configure the vault registry

The importer discovers the vaults Obsidian itself knows about (it reads
`obsidian.json` from your Obsidian config directory) and merges them with what
you configure. Vaults may live anywhere on disk; nothing assumes they are
nested.

Add descriptions - they are the single strongest routing signal:

```json
[
  {
    "name": "Mybrain.Leander",
    "kind": "personal",
    "path": "/absolute/path/to/Mybrain.Leander",
    "description": "My personal knowledge graph: self, patterns, dreams, relationships, taste, philosophy."
  },
  {
    "name": "Clarity",
    "kind": "project",
    "path": "/absolute/path/to/Clarity",
    "description": "Social network product: identity system, profiles, music integrations, backend, frontend."
  },
  {
    "name": "Mosaique",
    "kind": "project",
    "path": "/absolute/path/to/Mosaique",
    "description": "Company, events, sessions, recordings, gear, collaborators, visual identity."
  }
]
```

Fields: `name` (required, must match the Obsidian vault name so `obsidian://`
links work), `kind` (`personal` | `project` | `archive`), `path`, `description`,
`keywords`, `defaultFolder`, `enabled`.

Set **Personal Vault** to the vault that represents *you*. That vault is
protected: project work never lands in it, and personal patterns are never
written into a project vault, whatever the model suggests.

## 3. Choose the archive vault

**Source Archive Vault** + **Source Archive Folder** decide where the immutable
sources live (default: the open vault, `90 ChatGPT Sources`). Sources are stored
once, never copied into every destination. Notes in other vaults reference them
through metadata plus an `obsidian://` link, because wikilinks cannot cross
vault boundaries:

```yaml
source_vault: Mybrain.Leander
source_path: 90 ChatGPT Sources/2025/2025-03-04 Talking about control (a1b2c3d4).md
source_conversations:
  - 68f2c0c1-...
```

## 4. Run the import

Command palette -> **Import complete ChatGPT history**.

Three modes:

| Mode | What it does | API cost |
| --- | --- | --- |
| Full import | Archives sources, then extracts and routes knowledge | yes |
| Dry run | Plans everything, writes nothing, shows routing | yes |
| Archive sources only | Layer A only | none |

Progress shows the phase, counts and failures. You can close the modal or quit
Obsidian at any time - the run is resumable.

## 5. Resume, retry, reprocess

| Command | Use it when |
| --- | --- |
| **Resume ChatGPT import** | A run was interrupted, or new conversations are still pending |
| **Retry failed ChatGPT conversations** | Rate limits or network errors failed some conversations |
| **Reprocess a ChatGPT conversation** | You want one conversation re-analyzed |
| **Reprocess all conversations with the current processing version** | Extraction improved and you want the whole history re-run |
| **Rebuild knowledge index** | Maps of content, Dream Atlas and review queue should be regenerated |

Resume and reprocess read from the **source archive**, not from the export. Once
a conversation is archived, you never need the export file again to improve the
knowledge layer.

## 6. Keep it alive: the inbox

The historical export is a bootstrap, not the whole system.

Set **ChatGPT Inbox Folder** (default `ChatGPT Inbox`) and drop any of these
into it at any time:

- a fresh full export ZIP,
- a `conversations.json`,
- a single conversation in the generic shape
  `{ "conversationId", "title", "createdAt", "updatedAt", "messages": [...] }`.

Then either run **Process ChatGPT inbox now**, or turn on **Watch Inbox
Automatically** (or run **Watch ChatGPT inbox**) to have the folder polled while
Obsidian is open. Files whose size and modification time are unchanged are
skipped without being read.

New conversations go through the *same* pipeline as the historical import -
there is no second, weaker path for live data.

A future companion (browser extension, local helper) only needs to hand the
plugin that same generic payload; `LiveCaptureAdapter` runs it through the
standard pipeline. Nothing here depends on undocumented ChatGPT endpoints and
nothing scrapes.

## 7. How routing decides

For every unit, in order:

1. **The vault the model named**, matched against your live vault list.
2. **Keyword overlap** with each vault's profile (name, folders, index notes,
   description) when no name matched.
3. **A structural rule that can override both**: personal meaning stays in the
   personal vault; project work leaves it.

Then the destination folder is chosen by reusing a folder the vault already has
(`Patterns` matches your existing `03 Patterns`) before falling back to the
default ontology.

Finally the note itself is resolved: registry -> alias -> exact normalized title
-> close-enough title -> new note. "Fear of judgment", "fear of being judged"
and "judgment anxiety" merge into one note; "Fear of death" does not.

## 8. Review what the importer would not decide

Confidence thresholds (configurable):

| Confidence | Behavior |
| --- | --- |
| `>= Auto-Route Confidence` (0.75) | Filed automatically |
| `>= Review Threshold` (0.45) | Filed **and** listed in the review queue |
| below | Not filed into a topical note. Preserved in `99 System/Uncategorized/` and listed in the review queue |

**Open knowledge review queue** opens `99 System/Review Queue.md`. Nothing is
ever discarded: the source conversation is always archived in full, and
unroutable meaning is preserved rather than guessed into the wrong place.

## 9. Reprocess with a better model

Set **Knowledge Extraction Model** to whatever provider/model you want for bulk
work (for example `openai@gpt-4.1-mini` for volume, or a stronger model for a
second pass). Empty uses your default chat model. The importer goes through the
plugin's normal provider stack, so OpenAI, Anthropic, Gemini, OpenRouter,
Ollama, LM Studio and Z.AI all work.

When extraction logic changes in a way that justifies a re-run, the plugin's
`KNOWLEDGE_PROCESSING_VERSION` is bumped and every conversation processed under
an older version is reported as stale in **View ChatGPT import status** and
picked up by **Resume**. Re-runs merge into existing notes; they do not
duplicate evidence and they do not rewrite the archive.

## 10. Privacy

- Everything stays local: your export, your archive, your notes, the manifest.
- The only data that leaves your machine is the conversation text sent to the AI
  provider you configured, one conversation (or chunk) at a time.
- The import manifest lives with the plugin, in
  `.obsidian/plugins/chatgpt-md/knowledge-import-manifest.json` - inside your
  vault, not in this repository.
- `.gitignore` blocks exports, inbox folders, the manifest, and the
  `90 ChatGPT Sources/` and `99 System/` folders, so a vault checked out beside
  the plugin source cannot be committed by accident.
- Conversation content is never written to the log. Debug logging is opt-in and
  credential-redacting.

Keep personal knowledge in your local vaults. This repository holds only the
generic plugin implementation.


---

## What the personal vault refuses to become

The personal vault is treated as an **observatory over written traces**, not a
model of you. This is enforced in code, not only in prompts - the full mapping
is in [observatory-constitution.md](observatory-constitution.md).

What that changes in practice:

- **Three layers.** Every unit is a *trace* (recorded), a *garden* reading
  (provisional, dated, with a review date) or a *horizon* possibility. Notes say
  which they are, and garden material never gets the authority of a trace.
- **Old AI text is not evidence about you.** The export contains assistant
  messages. Anything resting on them is labelled "previous AI interpretation",
  capped in confidence, and never counted as independent support.
- **Repetition is not support.** Evidence blocks report distinct conversations
  and periods of reflection: ten conversations in one week are one episode, not
  ten confirmations.
- **What you did counts separately from what you said about yourself.**
  Behavioural evidence is marked "something done" and is collected across the
  whole vault when you challenge a story.
- **Ordinary language stays ordinary.** Clinical vocabulary you never used, and
  any essentializing phrasing, is held for review instead of being filed.
- **Some things are only preserved.** Fragments and strange connections are kept
  verbatim, with no interpretation attached.
- **Readings can die.** Concepts carry a status. Set `status: retired` in a note
  and it leaves retrieval and the indexes - the evidence stays, the reading stops
  shaping answers, and new evidence goes to the review queue rather than
  reactivating it.

### Commands that point away from the archive

| Command | What it does |
| --- | --- |
| **Challenge a story about myself** | Looks for what complicates a belief you hold, not what confirms it. Declines when the same question keeps returning. |
| **Open horizon** | Possibilities built from forgotten material. Never predictions, never ranked. |
| **Show me something I forgot** | Resurfaces by age instead of relevance. |
| **Unexpected connection** | Two distant notes beside each other, with no claim attached. |
| **Review personal models** | Asks whether old readings still fit, and lets you retire them. |
| **Enough analysis, back to life** | Ends a reflection: one thing kept, one question open, one small thing to live instead. |

If the vault is being used to decide who you really are, it should reduce
interpretation rather than increase it - and say plainly that the answer may not
be in there.

---

## Cost control

- Conversations with less of *your* text than **Minimum Conversation Length**
  are archived in full but never sent to a model.
- Unchanged conversations are skipped by content hash without a model call.
- Long conversations are chunked on message boundaries - never truncated - and
  the chunk results are merged.
- **Conversations In Parallel** bounds concurrency; transient rate limits are
  retried with exponential backoff.
- Every run records approximate characters sent to the model in its import log
  under `99 System/Import Logs/`. No pricing is invented.

## What gets written

```
Mybrain.Leander/
  00 HOME/                 Maps of Content, Patterns, Dream Atlas
  03 Patterns/             durable concept notes with dated evidence
  04 Dreams/Dreams/        one note per dream
  04 Dreams/Symbols/       recurring symbols, accumulating backlinks
  90 ChatGPT Sources/2025/ immutable source conversations
  14 Horizon/              possibilities, never predictions
  15 Fragments/            kept as written, not interpreted
  16 Strange Connections/  juxtapositions with no claim attached
  99 System/
    Import Logs/           one note per run
    Review Queue.md        what needs a human decision
    Model Review.md        readings that may have stopped fitting
    Challenges/            stories you asked the vault to complicate
    Uncategorized/         preserved but unrouted meaning

Clarity/
  Backend/Profile architecture.md   project knowledge, with cross-vault provenance
```

### Human content always wins

Generated content only ever lives between markers:

```markdown
## What I mean by this

Your own words. The importer never touches this.

## Evidence / Sources

<!-- chatgpt-md:auto:start id=evidence -->
### 2024

- **2024-01-01** - I take control when I feel uncertain - source: [[...]] <!-- unit:a1b2c3 conv:... -->

### 2026

- **2026-02-02** - I notice I need less certainty than I did - source: [[...]] <!-- unit:d4e5f6 conv:... -->
<!-- chatgpt-md:auto:end id=evidence -->
```

Evidence is grouped by year, so a note shows how your thinking changed instead
of overwriting the past with the latest interpretation. Contradictions get their
own `## Tension` block rather than being resolved away.

In frontmatter, only the keys the importer owns are touched; your own keys and
any YAML it does not understand are preserved verbatim.

### Interpretation is marked as interpretation

Anything the model inferred rather than read is written as
`possible interpretation - ...`, and dream themes carry an explicit disclaimer.
Symbol frequency is reported with the caveat that frequency is not significance.
No diagnoses, ever.

## Commands

| Command | Purpose |
| --- | --- |
| Import complete ChatGPT history | Historical bootstrap and reconciliation |
| Resume ChatGPT import | Continue pending work |
| Process ChatGPT inbox now | One-shot inbox pickup |
| Watch ChatGPT inbox / Stop watching | Continuous ingestion while Obsidian is open |
| Retry failed ChatGPT conversations | Retry after rate limits or network errors |
| Reprocess a ChatGPT conversation | Re-analyze one conversation |
| Reprocess all conversations... | Re-analyze everything at the current version |
| Rebuild knowledge index | Regenerate MOCs, Dream Atlas, review queue |
| View ChatGPT import status | Counts, last run, visible vaults |
| Open knowledge review queue | Jump to the review note |
| Dry run knowledge routing | Preview routing over the archive, write nothing |
| Configure vault router | Show the vaults the router can currently see |

## Troubleshooting

**"Vault X is not reachable from here and was skipped."**
The vault has no path, or you are on mobile. Add an absolute `path` in the
registry; cross-vault writing needs desktop.

**"The source archive vault X is not writable from here."**
The configured archive vault name does not match any resolved vault. Check
**View ChatGPT import status** for the list the router can see.

**ZIP64 archives are not supported.**
Extract `conversations.json` from the ZIP and select that instead.

**Conversations keep failing.**
Check the model name and API key, lower **Conversations In Parallel**, then run
**Retry failed ChatGPT conversations**. Failures never lose the archived source.
