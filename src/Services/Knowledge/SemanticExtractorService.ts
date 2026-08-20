import { NormalizedConversation, NormalizedMessage } from "src/Models/Knowledge/ChatGPTExport";
import {
  clampConfidence,
  coerceEntityType,
  coerceEvidenceType,
  coerceUnitKind,
  ConversationAnalysis,
  conversationAnalysisSchema,
  layerFor,
  PRESERVE_ONLY_KINDS,
  RawSemanticUnit,
  SemanticUnit,
} from "src/Models/Knowledge/SemanticUnit";
import { classifyOrigin, guardLanguage, GUARD_CONFIDENCE } from "src/Utilities/EpistemicGuards";
import { VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { buildExtractionPrompt, KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT } from "./KnowledgePrompts";
import { assessConversation, chunkMessages, detectDreamSignals } from "src/Utilities/KnowledgeHeuristics";
import { shortHash } from "src/Utilities/KnowledgeHashing";
import { isoDate, normalizeForHash, truncate } from "src/Utilities/KnowledgeText";
import { Logger } from "src/Utilities/Logger";

/**
 * Layer B, step one: turn one conversation into semantic units.
 *
 * The service is provider-agnostic by construction - it receives a caller
 * function and never touches the AI SDK, which keeps it fully testable and
 * lets the user pick any configured provider/model for bulk extraction.
 */

export type KnowledgeAiCaller = (system: string, user: string) => Promise<string>;

export interface ExtractionOptions {
  profiles: VaultProfile[];
  maxCharsPerChunk: number;
  minUserChars: number;
  enableDreams: boolean;
  enablePeople: boolean;
  enableMedia: boolean;
}

export interface ExtractionResult {
  analysis: ConversationAnalysis;
  skipped: boolean;
  skipReason?: string;
  approxPromptChars: number;
  chunkCount: number;
}

/** Strip code fences and locate the JSON object in a model response. */
export function extractJsonObject(response: string): string | null {
  const cleaned = (response || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("{")) return cleaned;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

export function parseAnalysisResponse(response: string): ConversationAnalysis | null {
  const json = extractJsonObject(response);
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const validated = conversationAnalysisSchema.safeParse(parsed);
  if (!validated.success) return null;

  return {
    conversationSummary: validated.data.conversationSummary || "",
    empty: validated.data.empty === true,
    units: (validated.data.units || [])
      .filter((unit) => typeof unit.content === "string" && unit.content.trim().length > 0)
      .map((unit) => toSemanticUnit(unit)),
  };
}

function toSemanticUnit(raw: RawSemanticUnit): SemanticUnit {
  const content = raw.content.trim();
  const kind = coerceUnitKind(raw.kind);
  const evidenceType = coerceEvidenceType(raw.evidenceType);
  const interpretation = raw.interpretation === true;
  return {
    id: "",
    kind,
    evidenceType,
    // Origin and layer are decided from the transcript, not from the model.
    origin: "user-originated",
    layer: layerFor(kind, evidenceType, interpretation),
    preserveOnly: raw.preserveOnly === true || PRESERVE_ONLY_KINDS.includes(kind),
    title: (raw.title || "").trim() || deriveTitle(content),
    content,
    suggestedVault: (raw.primaryVault || "").trim() || undefined,
    category: (raw.category || "").trim() || undefined,
    concepts: unique(raw.concepts),
    entities: (raw.entities || [])
      .filter((entity) => entity && typeof entity.name === "string" && entity.name.trim().length > 0)
      .map((entity) => ({ type: coerceEntityType(entity.type), name: entity.name.trim() })),
    emotions: unique(raw.emotions),
    symbols: unique(raw.symbols),
    people: unique(raw.people),
    places: unique(raw.places),
    interpretation,
    confidence: clampConfidence(raw.confidence),
    sourceMessageIds: unique(raw.sourceMessageIds),
    occurredOn: normalizeDate(raw.occurredOn),
  };
}

function unique(values: string[] | undefined): string[] {
  if (!values) return [];
  const cleaned = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(cleaned)];
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : undefined;
}

function deriveTitle(content: string): string {
  const firstSentence = content.split(/[.!?\n]/)[0].trim();
  return truncate(firstSentence || content, 60);
}

/**
 * Enforce the epistemic rules the prompt asks for, without trusting the model.
 *
 * Three things happen here, all of them structural rather than advisory:
 * 1. A unit that rests on assistant text is marked as a previous AI
 *    interpretation and capped in confidence, so it can never become
 *    independent evidence about the person.
 * 2. Clinical vocabulary the person never used is treated as interpretation and
 *    pushed below the auto-file threshold, so ordinary experience is not
 *    silently converted into symptoms.
 * 3. Essentializing language is held back for a human entirely.
 */
export function applyEpistemicGuards(units: SemanticUnit[], messages: NormalizedMessage[]): SemanticUnit[] {
  const userText = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");

  return units.map((unit) => {
    const guarded: SemanticUnit = { ...unit };
    const { origin } = classifyOrigin(unit.sourceMessageIds, messages, unit.evidenceType);
    guarded.origin = origin;

    if (origin === "assistant-originated") {
      guarded.evidenceType = "assistant-interpretation";
      guarded.interpretation = true;
      guarded.confidence = Math.min(guarded.confidence, GUARD_CONFIDENCE.assistantOriginated);
    }

    const language = guardLanguage(`${unit.title} ${unit.content}`, userText);
    if (language.introducedClinicalTerms.length > 0) {
      guarded.interpretation = true;
      guarded.confidence = Math.min(guarded.confidence, GUARD_CONFIDENCE.clinicalLanguage);
    }
    if (language.essentialistTerms.length > 0) {
      guarded.interpretation = true;
      guarded.confidence = Math.min(guarded.confidence, GUARD_CONFIDENCE.essentialist);
    }

    guarded.layer = layerFor(guarded.kind, guarded.evidenceType, guarded.interpretation);
    if (PRESERVE_ONLY_KINDS.includes(guarded.kind)) guarded.preserveOnly = true;
    return guarded;
  });
}

export class SemanticExtractorService {
  constructor(
    private readonly normalizer: ConversationNormalizer = new ConversationNormalizer(),
    private readonly maxRetries = 1
  ) {}

  /** Deterministic unit id: same content from the same conversation is the same unit. */
  static unitId(conversationId: string, unit: SemanticUnit): string {
    return shortHash(`${conversationId}|${unit.kind}|${unit.title.toLowerCase()}|${normalizeForHash(unit.content)}`);
  }

  async extract(
    conversation: NormalizedConversation,
    call: KnowledgeAiCaller,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    const verdict = assessConversation(conversation, options.minUserChars);
    if (verdict.skip) {
      return {
        analysis: { conversationSummary: "", units: [], empty: true },
        skipped: true,
        skipReason: verdict.reason,
        approxPromptChars: 0,
        chunkCount: 0,
      };
    }

    const relevant = conversation.messages.filter((message) => message.role === "user" || message.role === "assistant");
    const chunks = chunkMessages(relevant, options.maxCharsPerChunk);
    const date = isoDate(conversation.createdAt);
    const dreamLikely =
      options.enableDreams && detectDreamSignals(relevant.map((message) => message.content).join("\n"));

    const { summaries, units, approxPromptChars } = await this.analyzeChunks(conversation, chunks, call, options, {
      date,
      dreamLikely,
    });

    const guarded = applyEpistemicGuards(units, conversation.messages);
    const filtered = this.applyFeatureToggles(guarded, options);
    const deduped = this.dedupe(conversation.conversationId, filtered);

    return {
      analysis: {
        conversationSummary: summaries.join(" ").trim(),
        units: deduped,
        empty: deduped.length === 0,
      },
      skipped: false,
      approxPromptChars,
      chunkCount: chunks.length,
    };
  }

  /** One model call per chunk; results are merged, never truncated. */
  private async analyzeChunks(
    conversation: NormalizedConversation,
    chunks: NormalizedConversation["messages"][],
    call: KnowledgeAiCaller,
    options: ExtractionOptions,
    hints: { date?: string; dreamLikely: boolean }
  ): Promise<{ summaries: string[]; units: SemanticUnit[]; approxPromptChars: number }> {
    const summaries: string[] = [];
    const units: SemanticUnit[] = [];
    let approxPromptChars = 0;

    for (let index = 0; index < chunks.length; index++) {
      const prompt = buildExtractionPrompt({
        title: conversation.title,
        date: hints.date,
        transcript: this.normalizer.renderForAnalysis(chunks[index]),
        profiles: options.profiles,
        chunkIndex: index,
        chunkCount: chunks.length,
        dreamLikely: hints.dreamLikely,
      });
      approxPromptChars += prompt.length + KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT.length;

      const analysis = await this.callWithRetry(call, prompt, conversation.conversationId);
      if (!analysis) {
        throw new Error(`Model did not return usable JSON for conversation ${conversation.conversationId}`);
      }
      if (analysis.conversationSummary) summaries.push(analysis.conversationSummary);
      units.push(...analysis.units);
    }

    return { summaries, units, approxPromptChars };
  }

  private async callWithRetry(
    call: KnowledgeAiCaller,
    prompt: string,
    conversationId: string
  ): Promise<ConversationAnalysis | null> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const response = await call(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT, prompt);
      const analysis = parseAnalysisResponse(response);
      if (analysis) return analysis;
      Logger.warn("[ChatGPT MD] Unusable extraction response, retrying", { conversationId, attempt });
    }
    return null;
  }

  private applyFeatureToggles(units: SemanticUnit[], options: ExtractionOptions): SemanticUnit[] {
    return units.filter((unit) => {
      if (unit.kind === "dream" && !options.enableDreams) return false;
      if (unit.kind === "person" && !options.enablePeople) return false;
      if (unit.kind === "media" && !options.enableMedia) return false;
      return true;
    });
  }

  /** Merge chunk results: identical units from different chunks collapse. */
  private dedupe(conversationId: string, units: SemanticUnit[]): SemanticUnit[] {
    const byId = new Map<string, SemanticUnit>();
    units.forEach((unit) => {
      const id = SemanticExtractorService.unitId(conversationId, unit);
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, { ...unit, id });
        return;
      }
      existing.confidence = Math.max(existing.confidence, unit.confidence);
      existing.concepts = [...new Set([...existing.concepts, ...unit.concepts])];
      existing.sourceMessageIds = [...new Set([...existing.sourceMessageIds, ...unit.sourceMessageIds])];
    });
    return [...byId.values()];
  }
}
