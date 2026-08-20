import { z } from "zod";
import { coerceEvidenceType, EvidenceType, KnowledgeLayer, ProvenanceOrigin } from "./Epistemics";

/**
 * A semantic unit is the atom of the knowledge layer: one meaningful claim,
 * decision, memory, dream, possibility or reference extracted from a
 * conversation. One conversation usually produces several units that route to
 * different vaults and sit in different epistemic layers.
 */
export const SEMANTIC_UNIT_KINDS = [
  "insight",
  "pattern",
  "emotion",
  "belief",
  "value",
  "question",
  "contradiction",
  "lesson",
  "experience",
  "philosophy",
  "knowledge",
  "dream",
  "person",
  "relationship",
  "media",
  "music-idea",
  // Layers that keep the archive from becoming retrospective destiny.
  "horizon",
  "experiment",
  "fragment",
  "strange-connection",
  "project-decision",
  "project-knowledge",
  "other",
] as const;

export type SemanticUnitKind = (typeof SEMANTIC_UNIT_KINDS)[number];

/** Kinds that describe the person rather than an autonomous project. */
export const PERSONAL_UNIT_KINDS: readonly SemanticUnitKind[] = [
  "insight",
  "pattern",
  "emotion",
  "belief",
  "value",
  "question",
  "contradiction",
  "lesson",
  "experience",
  "philosophy",
  "dream",
  "person",
  "relationship",
  "media",
  "music-idea",
  "horizon",
  "experiment",
  "fragment",
  "strange-connection",
];

/** Kinds that belong to an autonomous project/company vault. */
export const PROJECT_UNIT_KINDS: readonly SemanticUnitKind[] = ["project-decision", "project-knowledge"];

/** Kinds that are preserved as written and never interpreted further. */
export const PRESERVE_ONLY_KINDS: readonly SemanticUnitKind[] = ["fragment", "strange-connection"];

export interface NamedEntity {
  type: "person" | "place" | "book" | "film" | "album" | "artist" | "organization" | "other";
  name: string;
}

export interface SemanticUnit {
  /** Deterministic id derived from conversation id + normalized content. */
  id: string;
  kind: SemanticUnitKind;
  /** Canonical, durable note title, e.g. "Control" - not a sentence. */
  title: string;
  /** The claim/observation itself, in the user's own framing where possible. */
  content: string;
  /** Vault name suggested by the model. Routing may override it. */
  suggestedVault?: string;
  /** Suggested area inside the vault, e.g. "Patterns", "Dreams", "Product". */
  category?: string;
  concepts: string[];
  entities: NamedEntity[];
  emotions?: string[];
  symbols?: string[];
  people?: string[];
  places?: string[];
  /** True when the statement is an interpretation rather than something stated. */
  interpretation?: boolean;
  confidence: number;
  sourceMessageIds: string[];
  /** ISO date the unit refers to (dream date, event date), when stated. */
  occurredOn?: string;
  /** What kind of evidence this is: something said, something done, an inference. */
  evidenceType: EvidenceType;
  /** Who produced the statement. Computed from the transcript, never trusted from the model. */
  origin: ProvenanceOrigin;
  /** Which epistemic layer this belongs to. */
  layer: KnowledgeLayer;
  /** Worth preserving, not worth interpreting. */
  preserveOnly?: boolean;
}

export interface ConversationAnalysis {
  conversationSummary: string;
  units: SemanticUnit[];
  /** True when the model judged the conversation to carry no durable meaning. */
  empty?: boolean;
}

/** Schema used to validate model output. Kept permissive so a single bad field
 * does not discard an otherwise usable analysis. */
export const semanticUnitSchema = z.object({
  kind: z.string(),
  title: z.string().optional(),
  content: z.string(),
  primaryVault: z.string().optional(),
  category: z.string().optional(),
  concepts: z.array(z.string()).optional(),
  entities: z
    .array(
      z.object({
        type: z.string().optional(),
        name: z.string(),
      })
    )
    .optional(),
  emotions: z.array(z.string()).optional(),
  symbols: z.array(z.string()).optional(),
  people: z.array(z.string()).optional(),
  places: z.array(z.string()).optional(),
  interpretation: z.boolean().optional(),
  confidence: z.number().optional(),
  sourceMessageIds: z.array(z.string()).optional(),
  occurredOn: z.string().optional(),
  evidenceType: z.string().optional(),
  preserveOnly: z.boolean().optional(),
});

export const conversationAnalysisSchema = z.object({
  conversationSummary: z.string().optional(),
  empty: z.boolean().optional(),
  units: z.array(semanticUnitSchema).optional(),
});

export type RawConversationAnalysis = z.infer<typeof conversationAnalysisSchema>;
export type RawSemanticUnit = z.infer<typeof semanticUnitSchema>;

const ENTITY_TYPES = ["person", "place", "book", "film", "album", "artist", "organization", "other"] as const;

export function coerceUnitKind(value: string | undefined): SemanticUnitKind {
  const normalized = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const match = SEMANTIC_UNIT_KINDS.find((kind) => kind === normalized);
  if (match) return match;
  // Common model synonyms mapped onto the closest supported kind.
  const synonyms: Record<string, SemanticUnitKind> = {
    idea: "insight",
    realization: "insight",
    observation: "insight",
    memory: "experience",
    decision: "project-decision",
    "product-decision": "project-decision",
    "project-info": "project-knowledge",
    "project-note": "project-knowledge",
    fact: "knowledge",
    book: "media",
    film: "media",
    movie: "media",
    album: "media",
    music: "music-idea",
    song: "music-idea",
    feeling: "emotion",
    behaviour: "pattern",
    behavior: "pattern",
    tension: "contradiction",
    possibility: "horizon",
    desire: "horizon",
    wish: "horizon",
    future: "horizon",
    intention: "horizon",
    "lived-experiment": "experiment",
    mystery: "fragment",
    unresolved: "fragment",
    juxtaposition: "strange-connection",
  };
  return synonyms[normalized] || "other";
}

export function coerceEntityType(value: string | undefined): NamedEntity["type"] {
  const normalized = (value || "").trim().toLowerCase();
  return ENTITY_TYPES.find((type) => type === normalized) || "other";
}

export function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  if (value > 1 && value <= 100) return Math.min(1, value / 100);
  return Math.min(1, Math.max(0, value));
}

const TRACE_KINDS: readonly SemanticUnitKind[] = ["dream", "experience", "fragment", "media", "person"];
const HORIZON_KINDS: readonly SemanticUnitKind[] = ["horizon", "experiment"];

/**
 * Which layer a unit belongs to.
 *
 * Something recorded stays a trace; something inferred goes to the garden;
 * something that has not happened yet goes to the horizon. Garden material must
 * never inherit the authority of a trace.
 */
export function layerFor(
  kind: SemanticUnitKind,
  evidenceType: EvidenceType,
  interpretation: boolean | undefined
): KnowledgeLayer {
  if (HORIZON_KINDS.includes(kind)) return "horizon";
  if (evidenceType === "assistant-interpretation" || evidenceType === "inference") return "garden";
  if (interpretation) return "garden";
  if (TRACE_KINDS.includes(kind)) return "trace";
  if (evidenceType === "direct-quote" || evidenceType === "event" || evidenceType === "reported-behavior") {
    return "trace";
  }
  return "garden";
}

export { coerceEvidenceType };
