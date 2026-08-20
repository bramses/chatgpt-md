import { NormalizedConversation } from "src/Models/Knowledge/ChatGPTExport";
import { VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { extractJsonObject, parseAnalysisResponse, SemanticExtractorService } from "./SemanticExtractorService";
import { chunkMessages, detectDreamSignals } from "src/Utilities/KnowledgeHeuristics";

/** Counting stub: ESM tests do not get the implicit `jest` global. */
function countingCaller(response: () => string) {
  const state = { calls: 0 };
  const caller = async (): Promise<string> => {
    state.calls++;
    return response();
  };
  return { caller, state };
}

const PROFILES: VaultProfile[] = [
  {
    vaultId: "mybrain",
    name: "Mybrain.Leander",
    kind: "personal",
    description: "Personal knowledge graph",
    folders: ["03 Patterns"],
    indexExcerpts: [],
    keywords: [],
    noteCount: 1,
  },
];

const OPTIONS = {
  profiles: PROFILES,
  maxCharsPerChunk: 400,
  minUserChars: 20,
  enableDreams: true,
  enablePeople: true,
  enableMedia: true,
};

function conversation(messages: Array<{ role: "user" | "assistant"; content: string }>): NormalizedConversation {
  return {
    conversationId: "conv-1",
    title: "A conversation",
    createdAt: 1735689600,
    messages: messages.map((message, index) => ({ id: `m${index}`, ...message })),
    sourceKind: "test",
  };
}

describe("parseAnalysisResponse", () => {
  it("parses a clean JSON response", () => {
    const analysis = parseAnalysisResponse(
      JSON.stringify({
        conversationSummary: "About control",
        units: [
          {
            kind: "pattern",
            title: "Control",
            content: "I take control.",
            primaryVault: "Mybrain.Leander",
            confidence: 0.9,
          },
        ],
      })
    )!;

    expect(analysis.units).toHaveLength(1);
    expect(analysis.units[0]).toMatchObject({
      kind: "pattern",
      title: "Control",
      suggestedVault: "Mybrain.Leander",
      confidence: 0.9,
    });
  });

  it("survives code fences and surrounding prose", () => {
    const response = 'Sure!\n```json\n{"units":[{"kind":"insight","content":"Something."}]}\n```\nHope that helps.';
    expect(parseAnalysisResponse(response)!.units).toHaveLength(1);
    expect(extractJsonObject(response)).toContain('"units"');
  });

  it("maps unknown kinds onto the closest supported kind", () => {
    const analysis = parseAnalysisResponse(
      JSON.stringify({ units: [{ kind: "realization", content: "A thought." }] })
    )!;
    expect(analysis.units[0].kind).toBe("insight");
  });

  it("normalizes confidence given as a percentage", () => {
    const analysis = parseAnalysisResponse(
      JSON.stringify({ units: [{ kind: "insight", content: "x", confidence: 85 }] })
    )!;
    expect(analysis.units[0].confidence).toBe(0.85);
  });

  it("drops units with no content instead of writing empty notes", () => {
    const analysis = parseAnalysisResponse(JSON.stringify({ units: [{ kind: "insight", content: "  " }] }))!;
    expect(analysis.units).toHaveLength(0);
  });

  it("returns null for unusable output", () => {
    expect(parseAnalysisResponse("I cannot do that")).toBeNull();
    expect(parseAnalysisResponse("{ broken json ")).toBeNull();
  });
});

describe("SemanticExtractorService", () => {
  const extractor = new SemanticExtractorService(new ConversationNormalizer(), 1);

  it("skips a conversation with too little of the person's own text", async () => {
    const { caller, state } = countingCaller(() => "{}");
    const result = await extractor.extract(conversation([{ role: "user", content: "hi" }]), caller, OPTIONS);

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("below minimum length");
    expect(state.calls).toBe(0);
  });

  it("skips a conversation that only contains assistant output", async () => {
    const { caller, state } = countingCaller(() => "{}");
    const result = await extractor.extract(
      conversation([{ role: "assistant", content: "a".repeat(500) }]),
      caller,
      OPTIONS
    );

    expect(result.skipped).toBe(true);
    expect(state.calls).toBe(0);
  });

  it("gives every unit a deterministic id", async () => {
    const call = async () =>
      JSON.stringify({ units: [{ kind: "pattern", title: "Control", content: "I take control.", confidence: 0.9 }] });
    const conversationFixture = conversation([
      { role: "user", content: "I always need to control everything around me." },
    ]);

    const first = await extractor.extract(conversationFixture, call, OPTIONS);
    const second = await extractor.extract(conversationFixture, call, OPTIONS);

    expect(first.analysis.units[0].id).toBe(second.analysis.units[0].id);
    expect(first.analysis.units[0].id).toHaveLength(12);
  });

  it("chunks a long conversation and merges the results", async () => {
    const calls: string[] = [];
    const call = async (_system: string, user: string) => {
      calls.push(user);
      const index = calls.length;
      return JSON.stringify({
        conversationSummary: `part ${index}`,
        units: [{ kind: "insight", title: `Insight ${index}`, content: `Content ${index}`, confidence: 0.9 }],
      });
    };

    const long = conversation([
      { role: "user", content: "a".repeat(300) },
      { role: "assistant", content: "b".repeat(300) },
      { role: "user", content: "c".repeat(300) },
    ]);

    const result = await extractor.extract(long, call, OPTIONS);

    expect(result.chunkCount).toBeGreaterThan(1);
    expect(calls).toHaveLength(result.chunkCount);
    expect(result.analysis.units.length).toBe(result.chunkCount);
    expect(result.approxPromptChars).toBeGreaterThan(0);
  });

  it("collapses identical units returned by different chunks", async () => {
    const call = async () =>
      JSON.stringify({ units: [{ kind: "insight", title: "Same", content: "Identical content.", confidence: 0.7 }] });
    const long = conversation([
      { role: "user", content: "a".repeat(300) },
      { role: "user", content: "b".repeat(300) },
    ]);

    const result = await extractor.extract(long, call, OPTIONS);
    expect(result.chunkCount).toBe(2);
    expect(result.analysis.units).toHaveLength(1);
  });

  it("retries once on unusable output and then fails loudly", async () => {
    const { caller, state } = countingCaller(() => "not json at all");
    await expect(
      extractor.extract(conversation([{ role: "user", content: "A long enough message to analyze." }]), caller, OPTIONS)
    ).rejects.toThrow(/did not return usable JSON/);
    expect(state.calls).toBe(2);
  });

  it("honours the feature toggles", async () => {
    const call = async () =>
      JSON.stringify({
        units: [
          { kind: "dream", content: "A dream.", confidence: 0.9 },
          { kind: "person", content: "A person.", confidence: 0.9 },
          { kind: "media", content: "A film.", confidence: 0.9 },
          { kind: "insight", content: "An insight.", confidence: 0.9 },
        ],
      });

    const result = await extractor.extract(
      conversation([{ role: "user", content: "A long enough message to analyze." }]),
      call,
      { ...OPTIONS, enableDreams: false, enablePeople: false, enableMedia: false }
    );

    expect(result.analysis.units.map((unit) => unit.kind)).toEqual(["insight"]);
  });
});

describe("heuristics", () => {
  it("recognizes dream descriptions in several languages", () => {
    expect(detectDreamSignals("I had a dream about a train")).toBe(true);
    expect(detectDreamSignals("Ik heb gedroomd over een trein")).toBe(true);
    expect(detectDreamSignals("Let us refactor this function")).toBe(false);
  });

  it("never splits a message across chunks", () => {
    const messages = [
      { id: "a", role: "user" as const, content: "x".repeat(100) },
      { id: "b", role: "user" as const, content: "y".repeat(100) },
      { id: "c", role: "user" as const, content: "z".repeat(100) },
    ];
    const chunks = chunkMessages(messages, 150);

    expect(chunks.flat()).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length >= 1)).toBe(true);
    expect(chunks.flat().map((message) => message.id)).toEqual(["a", "b", "c"]);
  });
});
