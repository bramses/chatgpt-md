import { SemanticUnit, SemanticUnitKind } from "src/Models/Knowledge/SemanticUnit";
import { VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { VaultRouterService } from "./VaultRouterService";

function profile(name: string, kind: VaultProfile["kind"], extras: Partial<VaultProfile> = {}): VaultProfile {
  return {
    vaultId: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    kind,
    description: "",
    folders: [],
    indexExcerpts: [],
    keywords: [],
    noteCount: 0,
    ...extras,
  };
}

const MYBRAIN = profile("Mybrain.Leander", "personal", {
  folders: [
    "00 HOME",
    "03 Patterns",
    "04 Dreams",
    "04 Dreams/Dreams",
    "04 Dreams/Symbols",
    "11 Library",
    "11 Library/Books",
    "10 Music",
  ],
  description: "Personal knowledge graph: self, patterns, dreams, relationships, taste.",
});
const CLARITY = profile("Clarity", "project", {
  folders: ["Product", "Backend", "Research"],
  keywords: ["clarity", "profiles", "supabase", "social"],
  description: "Social network product: identity system, profiles, music integrations, backend.",
});
const MOSAIQUE = profile("Mosaique", "project", {
  folders: ["Sessions", "Events", "Gear"],
  keywords: ["mosaique", "sessions", "recording", "concert", "gear"],
});

const PROFILES = [MYBRAIN, CLARITY, MOSAIQUE];

function unit(
  overrides: Partial<SemanticUnit> & { kind: SemanticUnitKind; title: string; content: string }
): SemanticUnit {
  return {
    id: overrides.id || "unit-1",
    concepts: [],
    entities: [],
    confidence: 0.9,
    sourceMessageIds: [],
    ...overrides,
  } as SemanticUnit;
}

describe("VaultRouterService", () => {
  const router = new VaultRouterService();
  const context = { profiles: PROFILES, personalVaultId: MYBRAIN.vaultId, autoThreshold: 0.75, reviewThreshold: 0.45 };

  it("routes project knowledge to the project vault the model named", () => {
    const decision = router.route(
      unit({
        kind: "project-knowledge",
        title: "Database schema",
        content: "Supabase schema for Clarity profiles",
        suggestedVault: "Clarity",
        category: "Backend",
      }),
      context
    );

    expect(decision.vaultName).toBe("Clarity");
    expect(decision.folder).toBe("Backend");
    expect(decision.status).toBe("auto");
  });

  it("routes project operations to the right project vault", () => {
    const decision = router.route(
      unit({
        kind: "project-knowledge",
        title: "Recording setup",
        content: "Mosaique Sessions recording chain",
        suggestedVault: "Mosaique",
        category: "Sessions",
      }),
      context
    );
    expect(decision.vaultName).toBe("Mosaique");
    expect(decision.folder).toBe("Sessions");
  });

  it("routes personal patterns to the personal vault", () => {
    const decision = router.route(
      unit({
        kind: "pattern",
        title: "Uncertainty",
        content: "How I react when I feel uncertain",
        suggestedVault: "Mybrain.Leander",
      }),
      context
    );
    expect(decision.vaultName).toBe("Mybrain.Leander");
    expect(decision.folder).toBe("03 Patterns");
    expect(decision.status).toBe("auto");
  });

  it("routes dreams into the existing dream folder", () => {
    const decision = router.route(
      unit({
        kind: "dream",
        title: "Being chased",
        content: "I dreamt I was being chased",
        suggestedVault: "Mybrain.Leander",
      }),
      context
    );
    expect(decision.folder).toBe("04 Dreams/Dreams");
  });

  it("routes a book to the library", () => {
    const decision = router.route(
      unit({
        kind: "media",
        title: "Infinite Jest",
        content: "A book I want to read",
        suggestedVault: "Mybrain.Leander",
        entities: [{ type: "book", name: "Infinite Jest" }],
      }),
      context
    );
    expect(decision.folder).toBe("11 Library/Books");
  });

  it("routes a musical idea to music", () => {
    const decision = router.route(
      unit({
        kind: "music-idea",
        title: "Song structure",
        content: "Structure I want to try",
        suggestedVault: "Mybrain.Leander",
      }),
      context
    );
    expect(decision.vaultName).toBe("Mybrain.Leander");
    expect(decision.folder).toContain("Music");
  });

  it("keeps a personal realization out of a project vault even when the model says otherwise", () => {
    const decision = router.route(
      unit({
        kind: "pattern",
        title: "Perfectionism",
        content: "I make projects too large because simple does not feel like enough",
        suggestedVault: "Clarity",
      }),
      context
    );

    expect(decision.vaultName).toBe("Mybrain.Leander");
    expect(decision.status).toBe("auto");
    expect(decision.reason).toMatch(/kept out of the project vault/i);
  });

  it("moves project work out of the personal vault", () => {
    const decision = router.route(
      unit({
        kind: "project-decision",
        title: "Profile architecture",
        content: "We will store profiles in Supabase",
        suggestedVault: "Mybrain.Leander",
        category: "Product",
      }),
      context
    );
    expect(decision.vaultName).not.toBe("Mybrain.Leander");
  });

  it("falls back to profile keywords when the model names no vault", () => {
    const decision = router.route(
      unit({
        kind: "project-knowledge",
        title: "Gear list",
        content: "Mosaique concert recording gear",
        concepts: ["mosaique", "recording"],
      }),
      context
    );
    expect(decision.vaultName).toBe("Mosaique");
  });

  it("holds low-confidence units back instead of guessing", () => {
    const decision = router.route(
      unit({ kind: "other", title: "Something", content: "Unclear fragment", confidence: 0.2 }),
      context
    );
    expect(decision.status).toBe("uncategorized");
  });

  it("flags medium-confidence units for review while still filing them", () => {
    const decision = router.route(
      unit({
        kind: "knowledge",
        title: "Attention economics",
        content: "Something I learned",
        suggestedVault: "Mybrain.Leander",
        confidence: 0.6,
      }),
      context
    );
    expect(decision.status).toBe("auto-review");
    expect(decision.vaultName).toBe("Mybrain.Leander");
  });

  it("reports uncategorized when no vault is available at all", () => {
    const decision = router.route(unit({ kind: "insight", title: "X", content: "Y" }), { ...context, profiles: [] });
    expect(decision.status).toBe("uncategorized");
    expect(decision.vaultId).toBeUndefined();
  });

  it("puts project knowledge under a knowledge folder when the category is unknown", () => {
    const decision = router.route(
      unit({ kind: "project-knowledge", title: "Random", content: "Clarity note", suggestedVault: "Clarity" }),
      context
    );
    expect(decision.folder).toBe("Research");
  });
});
