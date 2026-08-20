import { NormalizedConversation, NormalizedMessage } from "src/Models/Knowledge/ChatGPTExport";
import { layerFor, SemanticUnit, SemanticUnitKind } from "src/Models/Knowledge/SemanticUnit";
import { VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { ARCHIVE_BLIND_SPOTS, isSuppressedLifecycle } from "src/Models/Knowledge/Epistemics";
import { applyEpistemicGuards, SemanticExtractorService } from "./SemanticExtractorService";
import { ImportManifestService } from "./ImportManifestService";
import { MemoryVaultStore } from "./KnowledgeFileStore";
import { KnowledgeWriterService, WriteContext } from "./KnowledgeWriterService";
import { KnowledgeIndexService } from "./KnowledgeIndexService";
import { ModelReviewService } from "./ModelReviewService";
import { ReflectionService } from "./ReflectionService";
import { SemanticNoteResolver } from "./SemanticNoteResolver";
import { VaultRouterService } from "./VaultRouterService";
import { SerendipityService, pickDistantPair, pickForgotten } from "./SerendipityService";
import {
  KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT,
  CHALLENGE_STORY_SYSTEM_PROMPT,
  REFLECTION_GUARDRAILS,
} from "./KnowledgePrompts";
import { readManagedBlock } from "src/Utilities/KnowledgeText";

/**
 * Regression tests for the failure modes a personal knowledge system drifts
 * into: identity crystallization, archive bias, AI-on-AI feedback,
 * psychologization, prediction lock-in, analysis loops and memory maximalism.
 */

const CONTEXT: WriteContext = {
  archiveVaultId: "mybrain",
  archiveVaultName: "Mybrain.Leander",
  personalVaultId: "mybrain",
  processingVersion: 1,
  importedAt: "2026-08-20T10:00:00.000Z",
};

function unit(
  overrides: Partial<SemanticUnit> & { kind: SemanticUnitKind; title: string; content: string }
): SemanticUnit {
  return {
    id: overrides.id || "unit-1",
    concepts: [],
    entities: [],
    confidence: 0.9,
    sourceMessageIds: [],
    evidenceType: "direct-user-statement",
    origin: "user-originated",
    layer: "garden",
    ...overrides,
  };
}

async function harness(vaultId = "mybrain", vaultName = "Mybrain.Leander", seed: Record<string, string> = {}) {
  const manifest = new ImportManifestService(
    new MemoryVaultStore("p", "p"),
    "m.json",
    () => "2026-08-20T10:00:00.000Z"
  );
  await manifest.load();
  const resolver = new SemanticNoteResolver(manifest);
  return {
    manifest,
    resolver,
    store: new MemoryVaultStore(vaultId, vaultName, seed),
    writer: new KnowledgeWriterService(resolver, manifest),
  };
}

function decision(folder: string) {
  return {
    unitId: "unit-1",
    vaultId: "mybrain",
    vaultName: "Mybrain.Leander",
    folder,
    confidence: 0.9,
    status: "auto" as const,
    reason: "test",
  };
}

const CONVERSATION_REF = {
  conversationId: "conv-1",
  title: "A talk",
  date: "2026-01-01",
  sourcePath: "90 ChatGPT Sources/2026/A talk.md",
};

describe("previous AI interpretations never become evidence", () => {
  const messages: NormalizedMessage[] = [
    { id: "u1", role: "user", content: "I did not want to go to the party." },
    { id: "a1", role: "assistant", content: "That may be an avoidant response to intimacy." },
  ];

  it("marks a unit built on assistant text and caps its confidence", () => {
    const [guarded] = applyEpistemicGuards(
      [
        unit({
          kind: "pattern",
          title: "Intimacy",
          content: "An avoidant response to intimacy.",
          sourceMessageIds: ["a1"],
          confidence: 0.95,
        }),
      ],
      messages
    );

    expect(guarded.origin).toBe("assistant-originated");
    expect(guarded.evidenceType).toBe("assistant-interpretation");
    expect(guarded.interpretation).toBe(true);
    expect(guarded.confidence).toBeLessThanOrEqual(0.5);
    expect(guarded.layer).toBe("garden");
  });

  it("keeps a unit grounded in the person's own words as evidence", () => {
    const [guarded] = applyEpistemicGuards(
      [
        unit({
          kind: "experience",
          title: "The party",
          content: "Did not want to go to the party.",
          sourceMessageIds: ["u1"],
        }),
      ],
      messages
    );

    expect(guarded.origin).toBe("user-originated");
    expect(guarded.layer).toBe("trace");
    expect(guarded.confidence).toBe(0.9);
  });

  it("writes the AI origin into the note so it cannot be re-read as fact", async () => {
    const { writer, store } = await harness();
    const [guarded] = applyEpistemicGuards(
      [
        unit({
          kind: "pattern",
          title: "Intimacy",
          content: "An avoidant response to intimacy.",
          sourceMessageIds: ["a1"],
        }),
      ],
      messages
    );

    const result = await writer.writeUnit(
      { unit: guarded, decision: decision("03 Patterns"), conversation: CONVERSATION_REF, store, existingFolders: [] },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("previous AI interpretation - ");
    expect(content).toContain("assistant_originated_evidence: 1");
  });
});

describe("ordinary experience is not converted into symptoms", () => {
  const messages: NormalizedMessage[] = [{ id: "u1", role: "user", content: "I felt sad and wanted to leave early." }];

  it("holds back a reading that introduces clinical language", () => {
    const [guarded] = applyEpistemicGuards(
      [
        unit({
          kind: "pattern",
          title: "Avoidance",
          content: "This is avoidance and emotional dysregulation.",
          sourceMessageIds: ["u1"],
          confidence: 0.95,
        }),
      ],
      messages
    );

    expect(guarded.interpretation).toBe(true);
    // Below the default 0.45 review threshold, so it is reviewed, not filed.
    expect(guarded.confidence).toBeLessThan(0.45);
  });

  it("leaves the person's own vocabulary alone", () => {
    const own: NormalizedMessage[] = [
      { id: "u1", role: "user", content: "I know this is avoidance, I have read about it." },
    ];
    const [guarded] = applyEpistemicGuards(
      [
        unit({
          kind: "pattern",
          title: "Avoidance",
          content: "They describe this as avoidance.",
          sourceMessageIds: ["u1"],
          confidence: 0.9,
        }),
      ],
      own
    );
    expect(guarded.confidence).toBe(0.9);
  });

  it("refuses to file essentializing language at all", () => {
    const [guarded] = applyEpistemicGuards(
      [
        unit({
          kind: "insight",
          title: "Identity",
          content: "This is the core wound that defines you.",
          sourceMessageIds: ["u1"],
          confidence: 1,
        }),
      ],
      messages
    );
    expect(guarded.confidence).toBeLessThanOrEqual(0.3);
  });
});

describe("epistemic layers survive into the notes", () => {
  it("separates recorded traces, provisional readings and possibilities", () => {
    expect(layerFor("dream", "dream-report", false)).toBe("trace");
    expect(layerFor("pattern", "inference", true)).toBe("garden");
    expect(layerFor("horizon", "direct-user-statement", false)).toBe("horizon");
    expect(layerFor("experiment", "direct-user-statement", false)).toBe("horizon");
  });

  it("labels a provisional reading as provisional and gives it a review date", async () => {
    const { writer, store } = await harness();
    const result = await writer.writeUnit(
      {
        unit: unit({ kind: "pattern", title: "Control", content: "Takes control when uncertain.", layer: "garden" }),
        decision: decision("03 Patterns"),
        conversation: CONVERSATION_REF,
        store,
        existingFolders: [],
      },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("layer: garden");
    expect(content).toContain("epistemic_status: provisional");
    expect(content).toContain("expires_for_review:");
    expect(content).toContain("Provisional reading of written traces");
  });

  it("labels a possibility as a possibility, never as a prediction", async () => {
    const { writer, store } = await harness();
    const result = await writer.writeUnit(
      {
        unit: unit({
          kind: "horizon",
          title: "Living somewhere else",
          content: "Wants to try living abroad for a while.",
          layer: "horizon",
        }),
        decision: decision("14 Horizon"),
        conversation: CONVERSATION_REF,
        store,
        existingFolders: [],
      },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("epistemic_status: possibility");
    expect(content).toContain("Possibilities, not predictions");
  });
});

describe("not everything needs interpreting", () => {
  it("keeps a fragment as written, with no themes and no reading", async () => {
    const { writer, store } = await harness();
    const result = await writer.writeUnit(
      {
        unit: unit({
          kind: "fragment",
          title: "The blue hour in Lisbon",
          content: "The light before the streetlights came on.",
          concepts: ["Presence", "Travel"],
          preserveOnly: true,
        }),
        decision: decision("15 Fragments"),
        conversation: CONVERSATION_REF,
        store,
        existingFolders: [],
      },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("## As written");
    expect(content).toContain("No interpretation is offered or intended");
    expect(readManagedBlock(content, "related")).toBeNull();
    expect(content).not.toContain("[[Presence]]");
  });
});

describe("routing keeps the horizon out of the past", () => {
  const profile: VaultProfile = {
    vaultId: "mybrain",
    name: "Mybrain.Leander",
    kind: "personal",
    description: "",
    folders: ["03 Patterns", "14 Horizon", "15 Fragments", "16 Strange Connections"],
    indexExcerpts: [],
    keywords: [],
    noteCount: 4,
  };
  const context = { profiles: [profile], personalVaultId: "mybrain", autoThreshold: 0.75, reviewThreshold: 0.45 };

  it("files possibilities, fragments and juxtapositions in their own areas", () => {
    const router = new VaultRouterService();
    expect(
      router.route(
        unit({ kind: "horizon", title: "Sailing", content: "Never tried it.", suggestedVault: "Mybrain.Leander" }),
        context
      ).folder
    ).toBe("14 Horizon");
    expect(
      router.route(
        unit({ kind: "fragment", title: "A sentence", content: "Stays as it is.", suggestedVault: "Mybrain.Leander" }),
        context
      ).folder
    ).toBe("15 Fragments");
    expect(
      router.route(
        unit({
          kind: "strange-connection",
          title: "Tokyo and guitar",
          content: "Side by side.",
          suggestedVault: "Mybrain.Leander",
        }),
        context
      ).folder
    ).toBe("16 Strange Connections");
  });
});

describe("models can die", () => {
  const retiredNote = [
    "---",
    "type: concept",
    "status: retired",
    "surface_in_retrieval: false",
    "---",
    "",
    "# Fear of judgment",
    "",
    "This stopped fitting.",
    "",
  ].join("\n");

  it("keeps new evidence but does not quietly reactivate a retired reading", async () => {
    const { writer, store } = await harness("mybrain", "Mybrain.Leander", {
      "03 Patterns/Fear of judgment.md": retiredNote,
    });

    const result = await writer.writeUnit(
      {
        unit: unit({ kind: "pattern", title: "Fear of judgment", content: "Came up again this week." }),
        decision: decision("03 Patterns"),
        conversation: CONVERSATION_REF,
        store,
        existingFolders: ["03 Patterns"],
      },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(result.wasRetired).toBe(true);
    expect(content).toContain("status: retired");
    expect(content).toContain("surface_in_retrieval: false");
    expect(content).toContain("Came up again this week.");
    expect(content).toContain("This stopped fitting.");
  });

  it("picks up a status the person set by hand in the note", async () => {
    const { manifest, store } = await harness("mybrain", "Mybrain.Leander", {
      "03 Patterns/Control.md": "---\nstatus: historical\n---\n\n# Control\n",
    });
    manifest.putConcept({
      key: "mybrain:control",
      title: "Control",
      vaultId: "mybrain",
      path: "03 Patterns/Control.md",
      aliases: [],
      kind: "pattern",
      lifecycle: "active",
    });

    const synced = await new ModelReviewService(manifest).syncLifecycleFromNotes(store);

    expect(synced).toBe(1);
    expect(manifest.getConcept("mybrain:control")?.lifecycle).toBe("historical");
    expect(isSuppressedLifecycle(manifest.getConcept("mybrain:control")?.lifecycle)).toBe(true);
  });

  it("offers a finite review sheet with questions rather than verdicts", async () => {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "mybrain:old",
      title: "An old reading",
      vaultId: "mybrain",
      path: "03 Patterns/An old reading.md",
      aliases: [],
      kind: "pattern",
      lastObserved: "2023-01-01",
      lifecycle: "active",
    });

    const result = await new ModelReviewService(manifest).writeReviewNote(store, 5);
    const content = (await store.read(result.path))!;

    expect(result.candidates.map((concept) => concept.title)).toContain("An old reading");
    expect(content).toContain("Does this still describe anything useful?");
    expect(content).toContain("Being wrong about yourself later is a good outcome");
  });

  it("leaves retired readings out of the index but keeps them on disk", async () => {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "a",
      title: "Active",
      vaultId: "mybrain",
      path: "03 Patterns/Active.md",
      aliases: [],
      kind: "pattern",
      lifecycle: "active",
    });
    manifest.putConcept({
      key: "b",
      title: "Retired",
      vaultId: "mybrain",
      path: "03 Patterns/Retired.md",
      aliases: [],
      kind: "pattern",
      lifecycle: "retired",
    });
    await store.write("03 Patterns/Retired.md", "# Retired\n");

    await new KnowledgeIndexService(manifest).rebuild(store, []);
    const index = (await store.read("00 HOME/Concept Index.md"))!;

    expect(index).toContain("Active");
    expect(index).not.toContain("|Retired]]");
    expect(index).toContain("retired or historical readings are kept on disk");
    expect(await store.read("03 Patterns/Retired.md")).toBe("# Retired\n");
  });
});

describe("generated syntheses disclose what they cannot see", () => {
  it("names the blind spots in the indexes", async () => {
    const { manifest, store } = await harness();
    await new KnowledgeIndexService(manifest).rebuild(store, []);

    const index = (await store.read("00 HOME/Concept Index.md"))!;
    const atlas = (await store.read("00 HOME/Dream Atlas.md"))!;

    expect(index).toContain("What this cannot see");
    expect(index).toContain(ARCHIVE_BLIND_SPOTS[0]);
    expect(atlas).toContain("What this cannot see");
    expect(atlas).toContain("Frequency is not significance");
  });

  it("describes the map of content as an observatory, not a description of a person", async () => {
    const { manifest, store } = await harness();
    await new KnowledgeIndexService(manifest).rebuild(store, []);
    const moc = (await store.read("00 HOME/Maps of Content.md"))!;
    expect(moc).toContain("not a description of a person");
  });
});

describe("the archive declines to feed a loop", () => {
  it("refuses to answer a question asked three times in new words, and offers choices", async () => {
    const { manifest, store } = await harness();
    ["Do I actually trust myself?", "How do I know if I trust myself?", "What does trusting myself mean?"].forEach(
      (question) => manifest.recordQuestion(question)
    );

    let calls = 0;
    const call = async (): Promise<string> => {
      calls++;
      return "should never be called";
    };

    const reflection = new ReflectionService(manifest);
    const result = await reflection.challengeStory(store, "Can I be sure I have learned to trust myself?", call);

    expect(calls).toBe(0);
    expect(result.loop?.looping).toBe(true);
    expect(result.path).toBeUndefined();

    const message = reflection.describeLoop(result.loop!);
    expect(message).toContain("The vault may not contain the answer");
    expect(message).toContain("leave the question unresolved");
  });

  it("treats silence as a fact about the archive, not about the person", async () => {
    const { manifest, store } = await harness();
    const result = await new ReflectionService(manifest).challengeStory(
      store,
      "I have never been able to sing",
      async () => "unused"
    );

    expect(result.body).toContain("a fact about the archive and not about you");
    expect(result.body).toContain("What this cannot see");
  });

  it("gives the model what was done, not only what was said", async () => {
    const { manifest, writer, store } = await harness();
    await writer.writeUnit(
      {
        unit: unit({
          kind: "experience",
          title: "Travelling alone",
          content: "Went to Lisbon alone for three weeks.",
          evidenceType: "reported-behavior",
          layer: "trace",
        }),
        decision: decision("13 Experiences/Memories"),
        conversation: CONVERSATION_REF,
        store,
        existingFolders: [],
      },
      CONTEXT
    );

    const material = await new ReflectionService(manifest).gatherMaterial(store, "I never do anything risky");
    expect(material.behavioral.join(" ")).toContain("Lisbon");
  });
});

describe("serendipity reaches for the old and the distant", () => {
  const now = Date.parse("2026-08-20T00:00:00Z");
  const concepts = [
    {
      key: "a",
      title: "Recent",
      vaultId: "v",
      path: "03 Patterns/Recent.md",
      aliases: [],
      kind: "pattern",
      lastObserved: "2026-08-01",
    },
    {
      key: "b",
      title: "Old",
      vaultId: "v",
      path: "03 Patterns/Old.md",
      aliases: [],
      kind: "pattern",
      lastObserved: "2022-01-01",
    },
    {
      key: "c",
      title: "Retired",
      vaultId: "v",
      path: "03 Patterns/Retired.md",
      aliases: [],
      kind: "pattern",
      lastObserved: "2021-01-01",
      lifecycle: "retired" as const,
    },
  ];

  it("never resurfaces something the person retired", () => {
    const picks = pickForgotten(concepts, 3, now, () => 0.99);
    expect(picks.map((pick) => pick.concept.title)).not.toContain("Retired");
  });

  it("only surfaces things that have actually gone quiet", () => {
    const picks = pickForgotten(concepts, 3, now, () => 0.5);
    expect(picks.map((pick) => pick.concept.title)).toEqual(["Old"]);
    expect(picks[0].reason).toContain("months");
  });

  it("puts two notes from different areas beside each other without a claim", async () => {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "a",
      title: "Trains",
      vaultId: "mybrain",
      path: "04 Dreams/Symbols/Trains.md",
      aliases: [],
      kind: "dream",
    });
    manifest.putConcept({
      key: "b",
      title: "Distortion",
      vaultId: "mybrain",
      path: "10 Music/Sounds/Distortion.md",
      aliases: [],
      kind: "music-idea",
    });

    const pair = pickDistantPair(manifest.listConcepts(), () => 0);
    expect(pair?.[0].path.split("/")[0]).not.toBe(pair?.[1].path.split("/")[0]);

    const path = await new SerendipityService(manifest, () => 0).writeStrangeConnection(store);
    const content = (await store.read(path!))!;
    expect(content).toContain("no claim that one explains the other");
    expect(content).toContain("may come to nothing");
  });
});

describe("the prompts carry the constitution", () => {
  it("tells the model the archive is an observatory, not a person", () => {
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("observatory, not a model of the person");
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("The person is always larger than the archive");
  });

  it("forbids treating assistant text as evidence", () => {
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("never evidence that the statement is true about the person");
  });

  it("forbids essence, diagnosis and causal chains", () => {
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("core wound");
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("Association is not causation");
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("Never state a psychological diagnosis");
  });

  it("keeps the future open", () => {
    expect(KNOWLEDGE_EXTRACTION_SYSTEM_PROMPT).toContain("Absence of precedent is not improbability");
    expect(REFLECTION_GUARDRAILS).toContain("may do something the archive would never predict");
  });

  it("makes the challenge command look for complications, not confirmation", () => {
    expect(CHALLENGE_STORY_SYSTEM_PROMPT).toContain("not to confirm it and not to replace it with a better story");
    expect(CHALLENGE_STORY_SYSTEM_PROMPT).toContain("## Counterexamples");
    expect(CHALLENGE_STORY_SYSTEM_PROMPT).toContain("Do not conclude");
  });
});

describe("extraction keeps the deterministic guards in the pipeline", () => {
  it("applies the guards to model output before anything is written", async () => {
    const conversation: NormalizedConversation = {
      conversationId: "conv-1",
      title: "A talk",
      createdAt: 1767225600,
      sourceKind: "test",
      messages: [
        { id: "u1", role: "user", content: "I did not feel like going out tonight, so I stayed in and read." },
        { id: "a1", role: "assistant", content: "That could be an avoidant pattern." },
      ],
    };

    const call = async (): Promise<string> =>
      JSON.stringify({
        units: [
          {
            kind: "pattern",
            title: "Avoidance",
            content: "An avoidant pattern around going out.",
            confidence: 0.98,
            sourceMessageIds: ["a1"],
            evidenceType: "direct-user-statement",
          },
        ],
      });

    const result = await new SemanticExtractorService().extract(conversation, call, {
      profiles: [],
      maxCharsPerChunk: 4000,
      minUserChars: 10,
      enableDreams: true,
      enablePeople: true,
      enableMedia: true,
    });

    const [extracted] = result.analysis.units;
    expect(extracted.origin).toBe("assistant-originated");
    expect(extracted.evidenceType).toBe("assistant-interpretation");
    expect(extracted.confidence).toBeLessThanOrEqual(0.5);
  });
});
