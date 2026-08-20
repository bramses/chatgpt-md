import { NormalizedMessage } from "src/Models/Knowledge/ChatGPTExport";
import { EvidenceType, ProvenanceOrigin } from "src/Models/Knowledge/Epistemics";

/**
 * Deterministic guards that do not trust the model.
 *
 * The extraction prompt asks for honesty; these functions enforce it. They are
 * the difference between a system that says it avoids essentializing and a
 * system that structurally cannot file an essentializing claim as fact.
 */

/**
 * Decide who actually produced the material a unit rests on.
 *
 * This is the core anti-feedback-loop safeguard: the source archive contains
 * ChatGPT conversations, so it contains assistant text. Without this check the
 * system would read an old AI interpretation, store it as knowledge, generate
 * the same interpretation again, and then find two "sources" agreeing.
 */
export function classifyOrigin(
  sourceMessageIds: string[],
  messages: NormalizedMessage[],
  claimedEvidenceType: EvidenceType
): { origin: ProvenanceOrigin; resolved: boolean } {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const referenced = sourceMessageIds
    .map((id) => byId.get(id))
    .filter((message): message is NormalizedMessage => Boolean(message));

  if (referenced.some((message) => message.role === "user")) {
    return { origin: "user-originated", resolved: true };
  }
  if (referenced.length > 0) {
    return { origin: "assistant-originated", resolved: true };
  }
  // Nothing resolvable: fall back to what the model claimed, which is still
  // enough to keep declared assistant interpretations out of the evidence pool.
  return {
    origin: claimedEvidenceType === "assistant-interpretation" ? "assistant-originated" : "user-originated",
    resolved: false,
  };
}

/**
 * Clinical vocabulary that must not be introduced by the system.
 * Ordinary experience stays in ordinary language unless the person or a source
 * they cited used the technical term first.
 */
const CLINICAL_TERMS = [
  "avoidant",
  "avoidance",
  "attachment style",
  "anxious attachment",
  "dysregulation",
  "dysregulated",
  "maladaptive",
  "coping mechanism",
  "defense mechanism",
  "trauma response",
  "traumatized",
  "triggered",
  "codependent",
  "codependency",
  "narcissistic",
  "neurotic",
  "pathological",
  "disorder",
  "symptom",
  "diagnosis",
  "self-sabotage",
  "self-sabotaging",
  "repression",
  "repressed",
  "projection",
  "dissociation",
  "hypervigilance",
  "burnout",
  "depressive",
  "anxiety disorder",
];

/**
 * Essentializing vocabulary: language that turns a description of traces into a
 * definition of a person. Never acceptable from the system.
 */
const ESSENTIALIST_TERMS = [
  "core wound",
  "true self",
  "real self",
  "deepest fear",
  "deepest desire",
  "central trauma",
  "root cause of who",
  "who you really are",
  "who he really is",
  "defines you",
  "defines him",
  "this is who",
  "fundamental personality",
  "essence of",
  "always has been",
  "will always be",
  "proves that you",
  "proves that he",
];

export interface LanguageGuardResult {
  /** Clinical terms the system introduced that the source never used. */
  introducedClinicalTerms: string[];
  /** Essentializing phrases, which are never acceptable regardless of source. */
  essentialistTerms: string[];
}

function containsTerm(haystack: string, term: string): boolean {
  return haystack.includes(term);
}

/**
 * Compare generated text against the source it claims to describe.
 * Terms the person used themselves are fine; terms the system added are not.
 */
export function guardLanguage(generated: string, sourceText: string): LanguageGuardResult {
  const generatedLower = (generated || "").toLowerCase();
  const sourceLower = (sourceText || "").toLowerCase();

  return {
    introducedClinicalTerms: CLINICAL_TERMS.filter(
      (term) => containsTerm(generatedLower, term) && !containsTerm(sourceLower, term)
    ),
    essentialistTerms: ESSENTIALIST_TERMS.filter((term) => containsTerm(generatedLower, term)),
  };
}

/** Confidence ceilings applied when a guard fires. */
export const GUARD_CONFIDENCE = {
  /** Previous AI interpretation: usable context, never confirming evidence. */
  assistantOriginated: 0.5,
  /** System-introduced clinical language: reviewable, not filed as fact. */
  clinicalLanguage: 0.44,
  /** Essentializing language: always held back for a human. */
  essentialist: 0.3,
} as const;

/**
 * Recognize when a question is a rewording of one already asked.
 *
 * A personal archive makes it very easy to ask the same unresolved question in
 * new words forever, each time receiving a more elaborate answer and no new
 * evidence. This detects the loop so the system can decline to feed it.
 */
const QUESTION_STOP_WORDS = new Set([
  "what",
  "why",
  "how",
  "when",
  "do",
  "does",
  "did",
  "is",
  "am",
  "are",
  "was",
  "the",
  "a",
  "an",
  "i",
  "me",
  "my",
  "myself",
  "really",
  "actually",
  "just",
  "know",
  "think",
  "feel",
  "mean",
  "means",
  "about",
  "that",
  "this",
  "it",
  "to",
  "of",
  "in",
  "for",
  "and",
  "but",
  "if",
  "can",
  "could",
  "would",
  "should",
  "have",
  "has",
  "be",
  "been",
  "sure",
  "whether",
  "tell",
  "give",
  "definitive",
  "answer",
  "not",
  "but",
  "learn",
  "keep",
  "make",
  "always",
  "never",
]);

/**
 * Crude stemming so "trust", "trusting" and "trusted" count as one word.
 * A suffix is only dropped when at least four characters remain, which keeps
 * short words like "does" or "ties" intact.
 */
const SUFFIX = /(ing|edly|ed|ly|ness|ments|ment|ions|ion|ies|es|s)$/;

function stem(word: string): string {
  return word.replace(SUFFIX, (suffix, _group, offset: number) => (offset >= 4 ? "" : suffix)).replace(/i$/, "y");
}

export function questionFingerprint(question: string): string[] {
  return [
    ...new Set(
      (question || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 2 && !QUESTION_STOP_WORDS.has(word))
        .map(stem)
        .filter((word) => word.length > 2 && !QUESTION_STOP_WORDS.has(word))
    ),
  ].sort();
}

export function questionSimilarity(a: string, b: string): number {
  const tokensA = new Set(questionFingerprint(a));
  const tokensB = new Set(questionFingerprint(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) shared++;
  });
  return shared / Math.min(tokensA.size, tokensB.size);
}

export interface AskedQuestion {
  question: string;
  askedAt: string;
}

export interface RuminationVerdict {
  /** True when this question has been asked in substantially the same form before. */
  looping: boolean;
  /** How many times something close to this was asked before. */
  priorAskCount: number;
  /** The closest earlier question, when one exists. */
  closest?: AskedQuestion;
  similarity: number;
}

export const RUMINATION_SIMILARITY_THRESHOLD = 0.7;
/** Two askings is curiosity. Three or more of the same question is a loop. */
export const RUMINATION_MIN_REPEATS = 2;

export function detectRumination(
  question: string,
  history: AskedQuestion[],
  threshold = RUMINATION_SIMILARITY_THRESHOLD
): RuminationVerdict {
  let closest: AskedQuestion | undefined;
  let best = 0;
  let priorAskCount = 0;

  history.forEach((entry) => {
    const similarity = questionSimilarity(question, entry.question);
    if (similarity >= threshold) priorAskCount++;
    if (similarity > best) {
      best = similarity;
      closest = entry;
    }
  });

  return {
    looping: priorAskCount >= RUMINATION_MIN_REPEATS,
    priorAskCount,
    closest,
    similarity: Math.round(best * 100) / 100,
  };
}

/** Offered when a loop is detected. Never auto-chosen: the person decides. */
export const RUMINATION_OPTIONS: readonly string[] = [
  "read the earlier answer again instead of generating a new one",
  "look specifically for evidence that contradicts the question's premise",
  "leave the question unresolved for now",
  "turn the question into something to try in life",
  "stop analysing",
];
