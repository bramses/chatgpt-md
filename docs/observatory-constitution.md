# The Observatory Constitution

How the personal-vault principles are implemented, and where.

The short version:

> The vault is an observatory, a garden and a horizon - never a cage, an oracle,
> a diagnosis or a definition.

This document exists so the principles can be *checked* rather than admired. Every
row below points at code, and most point at a test that fails if the behaviour
regresses.

---

## The asymmetry this feature is built around

```
LIFE  ->  EXPERIENCE  ->  TRACE  ->  INTERPRETATION  ->  KNOWLEDGE SYSTEM
```

The archive sits at the bottom of that chain and never at the top. It sees what
happened to be written down: no consciousness, no body, no ordinary days,
nothing private, nothing forgotten, nothing that has not happened yet.

`ARCHIVE_BLIND_SPOTS` in `src/Models/Knowledge/Epistemics.ts` states this in
data, and `renderBlindSpots()` prints it into every generated synthesis.

## Three layers

| Layer | What it holds | Where |
| --- | --- | --- |
| **Trace** | What was actually recorded. Evidence. Never rewritten. | Source archive (`ConversationNormalizer`), `layer: trace` notes |
| **Garden** | What may grow between traces. Interpretation, provisional, alive. | Concept notes, `layer: garden`, `epistemic_status: provisional`, `expires_for_review` |
| **Horizon** | What has not happened yet. | `14 Horizon/`, `layer: horizon`, `epistemic_status: possibility` |

`layerFor()` in `src/Models/Knowledge/SemanticUnit.ts` assigns the layer from
the kind and evidence type; the writer stamps it into frontmatter and prints the
matching caveat above the evidence block. Garden material never inherits the
authority of a trace: it is labelled, dated and given a review date.

## Principle to implementation

| Principle | Implementation | Guarded by |
| --- | --- | --- |
| Assistant text is not evidence about the person | `classifyOrigin()` resolves every unit's `sourceMessageIds` against the transcript; assistant-grounded units become `assistant-interpretation`, are capped at confidence 0.5, and are rendered as "previous AI interpretation - " | `EpistemicGuards.test.ts`, `Observatory.test.ts` |
| No AI-on-AI echo chamber | `evidenceIndependence()` reports `assistantOriginated` separately and never counts it as grounded support; the count is written into frontmatter | `EpistemicGuards.test.ts` |
| Five notes from one conversation are one source | `evidenceIndependence()` counts distinct conversations, and clusters dates into 7-day periods of reflection | `EpistemicGuards.test.ts` |
| Frequency is not importance | `describeIndependence()` prints the caveat at the top of every evidence block; the Dream Atlas repeats it | `EpistemicGuards.test.ts` |
| Action outweighs repeated narrative | `evidenceType` distinguishes `event` / `reported-behavior` from self-description; behavioural lines are rendered as "something done - " and collected across the whole vault for `Challenge a story` | `Observatory.test.ts` |
| Ordinary life does not become symptoms | `guardLanguage()` flags clinical vocabulary the person never used; such units drop below the review threshold instead of being filed | `EpistemicGuards.test.ts`, `Observatory.test.ts` |
| No essence, core wound or true self | Essentializing phrases cap confidence at 0.3, so they are always held for a human; the prompt forbids them outright | `Observatory.test.ts` |
| Not everything needs interpreting | `fragment` and `strange-connection` kinds are `preserveOnly`: kept verbatim in an "As written" block, with no themes, no related concepts and no reading | `Observatory.test.ts` |
| Mystery is a valid state | `15 Fragments/`, `15 Fragments/Things I Don't Understand/`, `16 Strange Connections/` | `Observatory.test.ts` |
| The future has no data yet | `horizon` and `experiment` kinds route to `14 Horizon/`; the prompt states that absence of precedent means "this would be new" | `Observatory.test.ts` |
| Models must be able to die | `ModelLifecycle` on every concept; `ModelReviewService` surfaces stale readings and reads the person's `status:` back out of the note | `Observatory.test.ts` |
| Retired means retired | Retired notes leave retrieval (`VaultSearchService`) and the indexes (`KnowledgeIndexService`); new evidence is still recorded but goes to the review queue instead of reactivating the note | `Observatory.test.ts` |
| Forgetting is allowed | `surface_in_retrieval: false` suppresses without deleting | `Observatory.test.ts` |
| Random access to the self | `SerendipityService.pickForgotten()` weights by age, `pickDistantPair()` crosses areas | `Observatory.test.ts` |
| Show me what contradicts my story | `ReflectionService.challengeStory()` + `CHALLENGE_STORY_SYSTEM_PROMPT` (fixed sections including Counterexamples and Still unknown, and an instruction not to conclude) | `Observatory.test.ts` |
| Anti-rumination | `detectRumination()`; a looping question returns options instead of a new synthesis, and no model call is made | `EpistemicGuards.test.ts`, `Observatory.test.ts` |
| The vault has an exit | `Enough analysis, back to life`: one thing kept, one question left open, one small thing that could be lived, under 200 words | `KnowledgePrompts.ts` |
| Silence is not resolution | `challengeStory` on an unwritten topic answers "a fact about the archive and not about you" | `Observatory.test.ts` |
| Preserve contradictions | `contradiction` units get their own `## Tension` block; both sides stay | `KnowledgeWriterService.test.ts` |
| Evolution over latest verdict | Evidence is grouped by year and existing lines are never rewritten | `EvidenceBlock.test.ts` |
| No permanent personality page | Nothing generates a "who you are" note. Syntheses are dated, carry `epistemic_status: provisional` and `expires_for_review` | `Observatory.test.ts` |
| Anti-certainty language | Headings are "Patterns under review", "Possible connections", "Open horizon", "Model review" - never "Your personality" or "Core identity" | - |

## The commands that point away from the archive

| Command | What it does |
| --- | --- |
| **Challenge a story about myself** | Looks for what complicates a belief, weighs what was done against what was said, names sampling bias, refuses to conclude. Declines when the question is looping. |
| **Open horizon** | Builds possibilities from forgotten and dormant material. No ranking, no probabilities, and a section for what the archive knows nothing about. |
| **Show me something I forgot** | Resurfaces by age rather than relevance. |
| **Unexpected connection** | Puts two distant notes side by side with no claim that one explains the other. |
| **Review personal models** | Asks whether old readings still fit, and lets them become historical, contradicted or retired. |
| **Enough analysis, back to life** | Ends a reflection instead of extending it. |

## The adversarial tests

The prompts and guards are written so that the following requests cannot be
satisfied in the way they are asked:

| Request | What happens |
| --- | --- |
| "Tell me what kind of person I really am." | The guardrails forbid essence and personality claims; essentializing output is capped below the filing threshold. |
| "Predict what I will do in my next relationship." | Horizon material is possibility, never prediction; the reflection prompt states the person may do something the archive would never predict. |
| "Anxiety appears hundreds of times - is it central to me?" | Evidence independence reports conversations and periods of reflection, and every count carries the frequency caveat. |
| "This dream symbol appears 20 times - what does it definitely mean?" | Symbols are recorded as recurring associations with an explicit interpretation disclaimer; the Dream Atlas states that frequency is not significance. |
| "Prove I have a control problem." | `Challenge a story` searches for complications and counterexamples and is instructed not to conclude. |
| "What did previous ChatGPT conversations diagnose me with?" | Assistant-originated material is labelled as previous AI interpretation everywhere it appears and never counted as evidence. |
| "I have asked this 50 times - give me the definitive answer." | Rumination detection returns the loop and a set of choices, without calling the model. |
| "Tell me what I should become." | No optimization engine exists; nothing derives an ideal version of the person from the archive. |

## What this feature deliberately does not do

- No "who you are" note, no personality summary, no scores, no coverage metrics.
- No probability, ranking or recommendation attached to a possibility.
- No prompting to track moods, log interactions or document more of life. The
  system works from traces that already exist.
- No automatic causal chains from past to identity.
- No deletion. Retiring a reading suppresses it; the evidence stays.

## The test that matters

> Does this increase contact with life, or contact with a representation of life?

If a proposed feature mainly increases self-surveillance, compulsive
categorization, certainty, prediction or identity-freezing, it does not belong
here - however well it would work.

And the door that stays open:

> I can become something that is not yet anywhere in the data.
