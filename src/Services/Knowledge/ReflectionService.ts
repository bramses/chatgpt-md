import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { KnowledgeAiCaller } from "./SemanticExtractorService";
import { SerendipityService } from "./SerendipityService";
import { PERSONAL_FOLDERS } from "./PersonalOntology";
import {
  CHALLENGE_STORY_SYSTEM_PROMPT,
  ENOUGH_ANALYSIS_SYSTEM_PROMPT,
  HORIZON_SYSTEM_PROMPT,
} from "./KnowledgePrompts";
import {
  evidenceIndependence,
  describeIndependence,
  EvidenceEntry,
  parseEvidenceBlock,
} from "src/Utilities/EvidenceBlock";
import {
  detectRumination,
  questionFingerprint,
  RUMINATION_OPTIONS,
  RuminationVerdict,
} from "src/Utilities/EpistemicGuards";
import { renderBlindSpots } from "src/Models/Knowledge/Epistemics";
import {
  joinPath,
  readManagedBlock,
  sanitizeNoteName,
  truncate,
  upsertFrontmatterFields,
  upsertManagedBlock,
} from "src/Utilities/KnowledgeText";
import { isSuppressedLifecycle } from "src/Models/Knowledge/Epistemics";

/**
 * The commands that point away from the archive.
 *
 * Everything else in this feature helps the vault know more. This service
 * exists to keep the vault from becoming an oracle: it challenges stories
 * instead of confirming them, refuses to answer a question that is being asked
 * in a loop, opens possibilities the archive cannot predict, and knows how to
 * end a reflection instead of extending it.
 */

const MAX_MATCHED_NOTES = 12;
const MAX_EXCERPT = 700;
const REVIEW_INTERVAL_DAYS = 120;

export interface ChallengeMaterial {
  matched: Array<{ title: string; path: string; excerpt: string }>;
  /** Evidence lines describing something actually done, from anywhere in the vault. */
  behavioral: string[];
  supportingLines: EvidenceEntry[];
  assistantOriginated: number;
}

export interface ChallengeResult {
  /** Set when the question is a rewording of one already asked; no AI call was made. */
  loop?: RuminationVerdict;
  path?: string;
  body?: string;
  material?: ChallengeMaterial;
}

export class ReflectionService {
  constructor(
    private readonly manifest: ImportManifestService,
    private readonly serendipity: SerendipityService = new SerendipityService(manifest),
    private readonly clock: () => Date = () => new Date()
  ) {}

  /**
   * Gather what the vault actually holds about a story - including the parts
   * that complicate it. Behavioural evidence is collected separately because a
   * single thing done can outweigh a narrative repeated forty times.
   */
  async gatherMaterial(store: KnowledgeFileStore, hypothesis: string): Promise<ChallengeMaterial> {
    const tokens = questionFingerprint(hypothesis);
    const concepts = this.manifest
      .listConcepts()
      .filter((concept) => concept.vaultId === store.vaultId)
      .filter((concept) => !isSuppressedLifecycle(concept.lifecycle));

    const matched: ChallengeMaterial["matched"] = [];
    const supportingLines: EvidenceEntry[] = [];
    const behavioral: string[] = [];

    for (const concept of concepts) {
      const content = await store.read(concept.path);
      if (!content) continue;

      const entries = parseEvidenceBlock(readManagedBlock(content, "evidence"));
      // Something done is worth reading whether or not it matches the story.
      entries
        .filter((entry) => entry.evidenceType === "event" || entry.evidenceType === "reported-behavior")
        .slice(0, 3)
        .forEach((entry) => behavioral.push(`${concept.title}: ${stripMarker(entry.line)}`));

      const haystack = `${concept.title} ${content}`.toLowerCase();
      if (!tokens.some((token) => haystack.includes(token))) continue;

      matched.push({ title: concept.title, path: concept.path, excerpt: truncate(stripMarkup(content), MAX_EXCERPT) });
      supportingLines.push(...entries);
      if (matched.length >= MAX_MATCHED_NOTES) break;
    }

    return {
      matched,
      behavioral: behavioral.slice(0, 20),
      supportingLines,
      assistantOriginated: supportingLines.filter((entry) => entry.origin === "assistant-originated").length,
    };
  }

  /**
   * Look for what complicates a story rather than what confirms it.
   * If the same question keeps coming back, decline instead of answering again.
   */
  async challengeStory(
    store: KnowledgeFileStore,
    hypothesis: string,
    call: KnowledgeAiCaller
  ): Promise<ChallengeResult> {
    const loop = detectRumination(hypothesis, this.manifest.questionHistory());
    if (loop.looping) {
      this.manifest.recordQuestion(hypothesis);
      return { loop };
    }

    const material = await this.gatherMaterial(store, hypothesis);
    const stats = evidenceIndependence(material.supportingLines);

    if (material.matched.length === 0) {
      const body = this.renderSilence(hypothesis);
      const path = await this.writeChallengeNote(store, hypothesis, body, stats.mentions);
      this.manifest.recordQuestion(hypothesis, path);
      return { path, body, material };
    }

    const response = await call(CHALLENGE_STORY_SYSTEM_PROMPT, this.buildChallengePrompt(hypothesis, material, stats));
    const body = [response.trim(), "", renderBlindSpots()].join("\n");
    const path = await this.writeChallengeNote(store, hypothesis, body, stats.mentions);
    this.manifest.recordQuestion(hypothesis, path);
    return { path, body, material };
  }

  /** Absence of evidence is a fact about the archive, never about the person. */
  private renderSilence(hypothesis: string): string {
    return [
      "## The story being tested",
      "",
      hypothesis,
      "",
      "## What the archive holds",
      "",
      "Nothing in the vault speaks to this directly.",
      "",
      "That is not evidence against it. It means this has not been written about, which is a fact about the archive and not about you.",
      "",
      renderBlindSpots(),
    ].join("\n");
  }

  private buildChallengePrompt(
    hypothesis: string,
    material: ChallengeMaterial,
    stats: ReturnType<typeof evidenceIndependence>
  ): string {
    return [
      `Hypothesis the person is testing about themselves:\n\n${hypothesis}`,
      "",
      `How much the archive actually rests on: ${describeIndependence(stats)}`,
      material.assistantOriginated > 0
        ? `${material.assistantOriginated} of these lines come from previous AI interpretations and are not evidence.`
        : "",
      "",
      "## Notes that mention this",
      "",
      material.matched.map((note) => `### ${note.title}\n\n${note.excerpt}`).join("\n\n"),
      "",
      "## Things actually done, from across the vault",
      "",
      material.behavioral.length > 0 ? material.behavioral.map((line) => `- ${line}`).join("\n") : "None recorded.",
      "",
      "Write the sections you were told to write.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async writeChallengeNote(
    store: KnowledgeFileStore,
    hypothesis: string,
    body: string,
    mentions: number
  ): Promise<string> {
    const date = this.clock().toISOString().slice(0, 10);
    const path = joinPath(
      PERSONAL_FOLDERS.system,
      "Challenges",
      `${date} ${sanitizeNoteName(truncate(hypothesis, 60))}.md`
    );
    const existing = (await store.read(path)) ?? `# ${truncate(hypothesis, 80)}\n\n`;

    let content = upsertManagedBlock(existing, "challenge", "", body);
    content = upsertFrontmatterFields(content, {
      type: "story-challenge",
      layer: "garden",
      epistemic_status: "provisional",
      valid_from: date,
      expires_for_review: this.reviewDate(date),
      evidence_lines: mentions,
      generated_by: "chatgpt-md",
    });
    await store.write(path, content);
    return path;
  }

  /**
   * Possibilities, built from forgotten and dormant material rather than from
   * what the archive predicts. Nothing here is ranked or scored.
   */
  async openHorizon(store: KnowledgeFileStore, call: KnowledgeAiCaller): Promise<string> {
    const forgotten = this.serendipity.forgotten(store.vaultId, 6);
    const horizonNotes = await store.listFiles(PERSONAL_FOLDERS.horizon, {
      extension: ".md",
      recursive: true,
      limit: 40,
    });

    const material = [
      "Threads the archive has not touched in a long time:",
      "",
      forgotten.length > 0
        ? forgotten.map((pick) => `- ${pick.concept.title} (${pick.reason})`).join("\n")
        : "- nothing has gone quiet yet",
      "",
      "Existing horizon notes:",
      "",
      horizonNotes.length > 0 ? horizonNotes.map((path) => `- ${baseName(path)}`).join("\n") : "- none yet",
      "",
      "Write the sections you were told to write.",
    ].join("\n");

    const response = await call(HORIZON_SYSTEM_PROMPT, material);
    const date = this.clock().toISOString().slice(0, 10);
    const path = joinPath(PERSONAL_FOLDERS.horizon, "Open Horizon.md");

    const existing =
      (await store.read(path)) ??
      [
        "# Open Horizon",
        "",
        "Possibilities, not predictions. This note exists so the archive cannot turn the past into destiny.",
        "",
        "## Mine",
        "",
        "",
      ].join("\n");

    let content = upsertManagedBlock(existing, "horizon", "## Surfaced", `_Generated ${date}._\n\n${response.trim()}`);
    content = upsertFrontmatterFields(content, {
      type: "horizon",
      layer: "horizon",
      epistemic_status: "possibility",
      valid_from: date,
      generated_by: "chatgpt-md",
    });
    await store.write(path, content);
    return path;
  }

  /** End a reflection: one thing kept, one thing open, one thing to live. */
  async enoughAnalysis(topic: string, call: KnowledgeAiCaller): Promise<string> {
    const loop = detectRumination(topic, this.manifest.questionHistory());
    this.manifest.recordQuestion(topic);

    const prompt = [
      `The person has been reflecting on:\n\n${truncate(topic, 4000)}`,
      loop.looping
        ? `\nThis question has come back ${loop.priorAskCount} times in different wordings. Say so plainly, without judgement, and do not answer it again.`
        : "",
      "\nWrite the three sections you were told to write.",
    ]
      .filter(Boolean)
      .join("\n");

    return (await call(ENOUGH_ANALYSIS_SYSTEM_PROMPT, prompt)).trim();
  }

  /** Offered when a question is looping. The person chooses; the system does not. */
  describeLoop(verdict: RuminationVerdict): string {
    return [
      `This question has come back ${verdict.priorAskCount} times in different words` +
        (verdict.closest ? `, most recently on ${verdict.closest.askedAt.slice(0, 10)}` : "") +
        ".",
      "",
      "The archive appears to hold the same material it already held. Another synthesis would likely add certainty-seeking rather than evidence.",
      "",
      ...RUMINATION_OPTIONS.map((option) => `- ${option}`),
      "",
      "The vault may not contain the answer.",
    ].join("\n");
  }

  private reviewDate(date: string): string {
    const base = Date.parse(`${date}T00:00:00Z`);
    return new Date(base + REVIEW_INTERVAL_DAYS * 86400000).toISOString().slice(0, 10);
  }
}

function stripMarker(line: string): string {
  return line
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^-\s*/, "")
    .trim();
}

function stripMarkup(content: string): string {
  return content
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function baseName(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") || path;
}
