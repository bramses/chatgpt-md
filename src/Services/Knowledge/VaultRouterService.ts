import { PERSONAL_UNIT_KINDS, PROJECT_UNIT_KINDS, SemanticUnit } from "src/Models/Knowledge/SemanticUnit";
import { VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { matchExistingFolder, personalFolderFor, PERSONAL_FOLDERS, normalizeFolderSegment } from "./PersonalOntology";
import { normalizeConceptKey } from "src/Utilities/KnowledgeText";

/**
 * Meaning-based routing across every configured vault.
 *
 * Three things decide the destination, in order:
 * 1. the vault the extraction model named, matched against the live vault list;
 * 2. keyword overlap with each vault's semantic profile, when no name matched;
 * 3. a hard structural rule - projects stay in project vaults, the person's
 *    inner life stays in the personal vault - which can override both.
 *
 * Confidence decides whether the result is filed, filed and flagged, or held
 * back for review. Low confidence never writes into a topical note.
 */

export type RoutingStatus = "auto" | "auto-review" | "uncategorized";

export interface RoutingDecision {
  unitId: string;
  vaultId?: string;
  vaultName?: string;
  folder?: string;
  confidence: number;
  status: RoutingStatus;
  reason: string;
}

export interface RoutingContext {
  profiles: VaultProfile[];
  /** Vault that represents the person. Falls back to the archive vault. */
  personalVaultId?: string;
  autoThreshold: number;
  reviewThreshold: number;
}

const NAME_MATCH_BONUS = 0.05;
const KEYWORD_ROUTE_PENALTY = 0.25;
const NO_MATCH_CONFIDENCE = 0.2;

export class VaultRouterService {
  route(unit: SemanticUnit, context: RoutingContext): RoutingDecision {
    const enabled = context.profiles;
    if (enabled.length === 0) {
      return {
        unitId: unit.id,
        confidence: 0,
        status: "uncategorized",
        reason: "No vaults are available for routing",
      };
    }

    const initial = this.firstPass(unit, enabled);
    let { profile, confidence, reason } = initial;

    const corrected = this.applyStructuralRules(unit, profile, enabled, context);
    if (corrected) {
      profile = corrected.profile;
      reason = corrected.reason;
      confidence = corrected.confidence(confidence);
    }

    if (!profile) {
      return {
        unitId: unit.id,
        confidence: Math.min(confidence, NO_MATCH_CONFIDENCE),
        status: "uncategorized",
        reason,
      };
    }

    const folder = this.resolveFolder(unit, profile, context);
    const status: RoutingStatus =
      confidence >= context.autoThreshold
        ? "auto"
        : confidence >= context.reviewThreshold
          ? "auto-review"
          : "uncategorized";

    return {
      unitId: unit.id,
      vaultId: profile.vaultId,
      vaultName: profile.name,
      folder,
      confidence: round(confidence),
      status,
      reason,
    };
  }

  /** Vault named by the model first, keyword overlap with vault profiles second. */
  private firstPass(
    unit: SemanticUnit,
    profiles: VaultProfile[]
  ): { profile?: VaultProfile; confidence: number; reason: string } {
    const named = this.matchByName(unit.suggestedVault, profiles);
    if (named) {
      return {
        profile: named,
        confidence: Math.min(1, unit.confidence + NAME_MATCH_BONUS),
        reason: `Matched suggested vault "${unit.suggestedVault}"`,
      };
    }

    const scored = this.matchByProfile(unit, profiles);
    if (scored) {
      return {
        profile: scored.profile,
        confidence: Math.max(0, Math.min(unit.confidence, scored.score) - KEYWORD_ROUTE_PENALTY),
        reason: `Best profile overlap with ${scored.profile.name}`,
      };
    }

    return { confidence: NO_MATCH_CONFIDENCE, reason: "No vault matched the content" };
  }

  private matchByName(suggested: string | undefined, profiles: VaultProfile[]): VaultProfile | undefined {
    if (!suggested) return undefined;
    const normalized = normalizeConceptKey(suggested);
    return (
      profiles.find((profile) => profile.name.toLowerCase() === suggested.toLowerCase()) ||
      profiles.find((profile) => profile.vaultId === suggested.toLowerCase()) ||
      profiles.find((profile) => normalizeConceptKey(profile.name) === normalized)
    );
  }

  /** Keyword overlap between the unit's text and each vault's profile. */
  private matchByProfile(
    unit: SemanticUnit,
    profiles: VaultProfile[]
  ): { profile: VaultProfile; score: number } | undefined {
    const haystack = [
      unit.title,
      unit.content,
      unit.category || "",
      ...unit.concepts,
      ...unit.entities.map((entity) => entity.name),
    ]
      .join(" ")
      .toLowerCase();
    const tokens = new Set(haystack.split(/[^a-z0-9]+/).filter((token) => token.length >= 3));
    if (tokens.size === 0) return undefined;

    let best: { profile: VaultProfile; score: number } | undefined;
    profiles.forEach((profile) => {
      const signals = [profile.name.toLowerCase(), ...profile.keywords];
      let hits = 0;
      signals.forEach((signal) => {
        if (tokens.has(signal) || haystack.includes(` ${signal} `)) hits++;
      });
      if (hits === 0) return;
      const score = Math.min(0.95, 0.35 + hits * 0.12);
      if (!best || score > best.score) best = { profile, score };
    });
    return best;
  }

  /**
   * Structural correction: this is the rule the user cares most about.
   * A personal realization found while discussing a project still belongs to
   * the person, and project work never lands in the personal vault.
   */
  private applyStructuralRules(
    unit: SemanticUnit,
    profile: VaultProfile | undefined,
    profiles: VaultProfile[],
    context: RoutingContext
  ): { profile?: VaultProfile; reason: string; confidence: (current: number) => number } | undefined {
    const personal = this.personalProfile(profiles, context);
    const isPersonalKind = PERSONAL_UNIT_KINDS.includes(unit.kind);
    const isProjectKind = PROJECT_UNIT_KINDS.includes(unit.kind);

    if (isPersonalKind && personal && profile && profile.vaultId !== personal.vaultId && profile.kind !== "personal") {
      return {
        profile: personal,
        reason: `Personal ${unit.kind} kept out of the project vault "${profile.name}"`,
        confidence: (current) => Math.max(current, context.autoThreshold),
      };
    }

    if (isPersonalKind && !profile && personal) {
      return {
        profile: personal,
        reason: `Personal ${unit.kind} routed to the personal vault`,
        confidence: (current) => Math.max(current, context.reviewThreshold),
      };
    }

    if (isProjectKind && profile && profile.kind === "personal") {
      const project = profiles.find(
        (candidate) => candidate.kind === "project" && candidate.vaultId !== profile.vaultId
      );
      if (!project) {
        return {
          profile: undefined,
          reason: "Project knowledge with no matching project vault",
          confidence: () => NO_MATCH_CONFIDENCE,
        };
      }
      return {
        profile: project,
        reason: `Project knowledge moved out of the personal vault into "${project.name}"`,
        confidence: (current) => Math.min(current, context.reviewThreshold),
      };
    }

    return undefined;
  }

  private personalProfile(profiles: VaultProfile[], context: RoutingContext): VaultProfile | undefined {
    if (context.personalVaultId) {
      const configured = profiles.find((profile) => profile.vaultId === context.personalVaultId);
      if (configured) return configured;
    }
    return profiles.find((profile) => profile.kind === "personal");
  }

  /** Prefer folders the vault already has; only then fall back to defaults. */
  resolveFolder(unit: SemanticUnit, profile: VaultProfile, context: RoutingContext): string {
    const isPersonal = profile.kind === "personal" || profile.vaultId === context.personalVaultId;

    if (unit.category) {
      const existing = matchExistingFolder(profile.folders, unit.category);
      if (existing) return existing;
    }

    if (isPersonal) {
      const desired = personalFolderFor(unit);
      return matchExistingFolder(profile.folders, desired) || desired;
    }

    if (unit.category) {
      const cleaned = unit.category.replace(/^\/+|\/+$/g, "").trim();
      if (cleaned && !/^untitled$/i.test(cleaned)) {
        const known = profile.folders.find(
          (folder) => normalizeFolderSegment(lastSegment(folder)) === normalizeFolderSegment(cleaned)
        );
        return known || `${defaultProjectFolder(profile)}/${cleaned}`;
      }
    }

    return defaultProjectFolder(profile);
  }
}

function defaultProjectFolder(profile: VaultProfile): string {
  const knowledgeFolder = profile.folders.find((folder) => /knowledge|notes|research/i.test(lastSegment(folder)));
  return knowledgeFolder || "ChatGPT Knowledge";
}

function lastSegment(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1];
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export const UNCATEGORIZED_FOLDER = PERSONAL_FOLDERS.uncategorized;
