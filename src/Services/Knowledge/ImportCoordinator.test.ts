import { App } from "obsidian";
import { ChatGPT_MDSettings, DEFAULT_SETTINGS } from "src/Models/Config";
import { VaultDefinition, VaultProfile } from "src/Models/Knowledge/VaultDefinition";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { ImportCoordinator } from "./ImportCoordinator";
import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeFileStore, MemoryVaultStore } from "./KnowledgeFileStore";
import { SemanticExtractorService } from "./SemanticExtractorService";
import { VaultRegistryService } from "./VaultRegistryService";
import { VaultRouterService } from "./VaultRouterService";
import { ChatGPTExportParser } from "./ChatGPTExportParser";
import { ConversationBatch, ConversationIngestionAdapter } from "./Sources/ConversationSource";
import { ArchiveSourceAdapter } from "./Sources/ArchiveSourceAdapter";

/**
 * End-to-end pipeline tests: ingestion through routing, writing, provenance,
 * idempotency and resume - with in-memory vaults and a scripted model.
 */

const MYBRAIN: VaultDefinition = {
  id: "mybrain",
  name: "Mybrain.Leander",
  kind: "personal",
  path: "/vaults/mybrain",
  enabled: true,
  isCurrent: true,
  origin: "current",
};

const CLARITY: VaultDefinition = {
  id: "clarity",
  name: "Clarity",
  kind: "project",
  path: "/vaults/clarity",
  enabled: true,
  origin: "configured",
  description: "Social network product",
};

function profileFor(vault: VaultDefinition, folders: string[]): VaultProfile {
  return {
    vaultId: vault.id,
    name: vault.name,
    kind: vault.kind,
    description: vault.description || "",
    folders,
    indexExcerpts: [],
    keywords: [vault.name.toLowerCase()],
    noteCount: folders.length,
  };
}

function conversationJson(id: string, title: string, userText: string, created = 1735689600): unknown {
  return {
    conversation_id: id,
    title,
    create_time: created,
    current_node: "n2",
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["n1"] },
      n1: {
        id: "n1",
        parent: "root",
        children: ["n2"],
        message: { id: `${id}-m1`, author: { role: "user" }, create_time: created, content: { parts: [userText] } },
      },
      n2: {
        id: "n2",
        parent: "n1",
        children: [],
        message: {
          id: `${id}-m2`,
          author: { role: "assistant" },
          create_time: created + 10,
          content: { parts: ["That is worth writing down."] },
        },
      },
    },
  };
}

class StubAdapter implements ConversationIngestionAdapter {
  readonly kind = "official-export";
  constructor(private readonly entries: unknown[]) {}
  describe(): string {
    return "stub export";
  }
  async load(): Promise<ConversationBatch[]> {
    const parsed = new ChatGPTExportParser().parseValue(this.entries, this.kind, "stub.json");
    return [
      {
        ref: "stub.json",
        conversations: parsed.conversations,
        warnings: parsed.warnings,
        totalEntries: parsed.totalEntries,
      },
    ];
  }
}

/** Scripted model: returns the analysis registered for a conversation title. */
class ScriptedModel {
  calls = 0;
  failuresLeft = 0;
  private readonly responses = new Map<string, unknown>();

  register(titleFragment: string, analysis: unknown): void {
    this.responses.set(titleFragment, analysis);
  }

  caller = async (_system: string, user: string): Promise<string> => {
    this.calls++;
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error("rate limit exceeded");
    }
    for (const [fragment, analysis] of this.responses.entries()) {
      if (user.includes(fragment)) return JSON.stringify(analysis);
    }
    return JSON.stringify({ conversationSummary: "nothing", empty: true, units: [] });
  };
}

function settings(overrides: Partial<ChatGPT_MDSettings> = {}): ChatGPT_MDSettings {
  return {
    ...DEFAULT_SETTINGS,
    knowledgeEnabled: true,
    knowledgeArchiveVault: "Mybrain.Leander",
    knowledgePersonalVault: "Mybrain.Leander",
    knowledgeArchiveFolder: "90 ChatGPT Sources",
    knowledgeBatchSize: 2,
    knowledgeMinConversationChars: 10,
    ...overrides,
  };
}

async function harness(options: { settings?: ChatGPT_MDSettings } = {}) {
  const stores = new Map<string, MemoryVaultStore>([
    ["mybrain", new MemoryVaultStore("mybrain", "Mybrain.Leander")],
    ["clarity", new MemoryVaultStore("clarity", "Clarity")],
  ]);
  const folders = new Map<string, string[]>([
    ["mybrain", ["00 HOME", "03 Patterns", "04 Dreams/Dreams", "04 Dreams/Symbols", "90 ChatGPT Sources", "99 System"]],
    ["clarity", ["Product", "Backend"]],
  ]);

  const registry = {
    resolveVaults: async (): Promise<VaultDefinition[]> => [MYBRAIN, CLARITY],
    storeFor: (vault: VaultDefinition): KnowledgeFileStore | null => stores.get(vault.id) || null,
    buildProfile: async (vault: VaultDefinition): Promise<VaultProfile> =>
      profileFor(vault, folders.get(vault.id) || []),
  } as unknown as VaultRegistryService;

  const manifestStore = new MemoryVaultStore("plugin", "plugin");
  const manifest = new ImportManifestService(manifestStore, "manifest.json");
  await manifest.load();

  const model = new ScriptedModel();
  const coordinator = new ImportCoordinator({
    app: {} as App,
    registry,
    manifest,
    extractor: new SemanticExtractorService(),
    router: new VaultRouterService(),
    normalizer: new ConversationNormalizer(),
    createCaller: () => model.caller,
    getSettings: () => options.settings || settings(),
  });

  return { coordinator, manifest, stores, model, registry };
}

const SPLIT_ANALYSIS = {
  conversationSummary: "Clarity feature discussion that also revealed a personal pattern.",
  units: [
    {
      kind: "project-decision",
      title: "Profile architecture",
      content: "Profiles will be stored in Supabase with a separate identity table.",
      primaryVault: "Clarity",
      category: "Backend",
      confidence: 0.95,
      sourceMessageIds: ["conv-split-m1"],
    },
    {
      kind: "pattern",
      title: "Perfectionism",
      content: "I keep adding features because a simple idea does not feel like enough.",
      primaryVault: "Mybrain.Leander",
      category: "Patterns",
      concepts: ["Control"],
      confidence: 0.92,
      sourceMessageIds: ["conv-split-m1"],
    },
  ],
};

describe("ImportCoordinator end to end", () => {
  it("archives every conversation and routes units into the right vaults", async () => {
    const { coordinator, stores, model } = await harness();
    model.register("Clarity profiles", SPLIT_ANALYSIS);

    const summary = await coordinator.run(
      [new StubAdapter([conversationJson("conv-split", "Clarity profiles", "How should Clarity store profiles?")])],
      { mode: "import" }
    );

    expect(summary.run.conversationsSeen).toBe(1);
    expect(summary.run.conversationsArchived).toBe(1);
    expect(summary.run.conversationsProcessed).toBe(1);
    expect(summary.run.unitsWritten).toBe(2);

    const mybrain = stores.get("mybrain")!;
    const clarity = stores.get("clarity")!;

    const sourcePath = [...mybrain.files.keys()].find((path) => path.startsWith("90 ChatGPT Sources"))!;
    expect(sourcePath).toContain("2025-01-01 Clarity profiles");
    const source = mybrain.files.get(sourcePath)!;
    expect(source).toContain("type: chatgpt-source");
    expect(source).toContain("How should Clarity store profiles?");
    expect(source).toContain("processed: true");

    expect(mybrain.files.has("03 Patterns/Perfectionism.md")).toBe(true);
    expect(clarity.files.has("Backend/Profile architecture.md")).toBe(true);

    // The personal pattern must not leak into the project vault, and vice versa.
    expect([...clarity.files.keys()].some((path) => path.includes("Perfectionism"))).toBe(false);
    expect([...mybrain.files.keys()].some((path) => path.includes("Profile architecture"))).toBe(false);

    // Cross-vault provenance is metadata plus an obsidian:// link.
    const projectNote = clarity.files.get("Backend/Profile architecture.md")!;
    expect(projectNote).toContain("source_vault: Mybrain.Leander");
    expect(projectNote).toContain("obsidian://open?vault=Mybrain.Leander");
  });

  it("is idempotent: importing the same export twice writes nothing new", async () => {
    const { coordinator, stores, model } = await harness();
    model.register("Clarity profiles", SPLIT_ANALYSIS);
    const entries = [conversationJson("conv-split", "Clarity profiles", "How should Clarity store profiles?")];

    await coordinator.run([new StubAdapter(entries)], { mode: "import" });
    const knowledgeNotes = (): string[] =>
      [...stores.get("mybrain")!.files.keys()].filter((path) => !path.startsWith("99 System/Import Logs")).sort();
    const afterFirst = knowledgeNotes();
    const callsAfterFirst = model.calls;

    const second = await coordinator.run([new StubAdapter(entries)], { mode: "reconcile" });

    expect(second.run.conversationsSkipped).toBe(1);
    expect(second.run.conversationsProcessed).toBe(0);
    expect(model.calls).toBe(callsAfterFirst);

    const patternNote = stores.get("mybrain")!.files.get("03 Patterns/Perfectionism.md")!;
    expect((patternNote.match(/<!-- unit:/g) || []).length).toBe(1);
    expect(knowledgeNotes()).toEqual(afterFirst);
  });

  it("picks up only the missing conversations from a later export", async () => {
    const { coordinator, manifest, model } = await harness();
    model.register("Clarity profiles", SPLIT_ANALYSIS);

    await coordinator.run(
      [new StubAdapter([conversationJson("conv-1", "Clarity profiles", "How should Clarity store profiles?")])],
      {
        mode: "import",
      }
    );

    const bigger = [
      conversationJson("conv-1", "Clarity profiles", "How should Clarity store profiles?"),
      conversationJson("conv-2", "Another talk", "Something else entirely that is long enough."),
    ];
    const summary = await coordinator.run([new StubAdapter(bigger)], { mode: "reconcile" });

    expect(summary.run.conversationsSeen).toBe(1);
    expect(manifest.status().totalKnown).toBe(2);
  });

  it("detects that a conversation grew and merges the new meaning without duplicating the old", async () => {
    const { coordinator, stores, model } = await harness();
    model.register("Ongoing chat", {
      units: [
        {
          kind: "pattern",
          title: "Control",
          content: "First observation about control.",
          primaryVault: "Mybrain.Leander",
          confidence: 0.9,
        },
      ],
    });

    await coordinator.run(
      [new StubAdapter([conversationJson("conv-grow", "Ongoing chat", "I need control over everything here.")])],
      {
        mode: "import",
      }
    );

    model.register("Ongoing chat", {
      units: [
        {
          kind: "pattern",
          title: "Control",
          content: "First observation about control.",
          primaryVault: "Mybrain.Leander",
          confidence: 0.9,
        },
        {
          kind: "pattern",
          title: "Control",
          content: "A second, later observation.",
          primaryVault: "Mybrain.Leander",
          confidence: 0.9,
        },
      ],
    });

    const grown = {
      ...(conversationJson("conv-grow", "Ongoing chat", "I need control over everything here.") as Record<
        string,
        unknown
      >),
    };
    const mapping = grown.mapping as Record<string, unknown>;
    (mapping.n2 as Record<string, unknown>).children = ["n3"];
    mapping.n3 = {
      id: "n3",
      parent: "n2",
      children: [],
      message: {
        id: "conv-grow-m3",
        author: { role: "user" },
        content: { parts: ["And now there is much more to say."] },
      },
    };
    grown.current_node = "n3";

    const summary = await coordinator.run([new StubAdapter([grown])], { mode: "reconcile" });
    expect(summary.run.conversationsProcessed).toBe(1);

    const mybrain = stores.get("mybrain")!;
    const controlNotes = [...mybrain.files.keys()].filter((path) => path.includes("Control"));
    expect(controlNotes).toEqual(["03 Patterns/Control.md"]);

    const note = mybrain.files.get("03 Patterns/Control.md")!;
    expect((note.match(/<!-- unit:/g) || []).length).toBe(2);

    const sources = [...mybrain.files.keys()].filter((path) => path.startsWith("90 ChatGPT Sources"));
    expect(sources).toHaveLength(1);
    expect(mybrain.files.get(sources[0])).toContain("And now there is much more to say.");
  });

  it("resumes after an interruption without redoing finished work", async () => {
    const { coordinator, manifest, stores, model } = await harness({ settings: settings({ knowledgeBatchSize: 1 }) });
    model.register("First", {
      units: [
        { kind: "insight", title: "One", content: "First insight.", primaryVault: "Mybrain.Leander", confidence: 0.9 },
      ],
    });
    model.register("Second", {
      units: [
        { kind: "insight", title: "Two", content: "Second insight.", primaryVault: "Mybrain.Leander", confidence: 0.9 },
      ],
    });

    const entries = [
      conversationJson("conv-a", "First", "A long enough first message about something."),
      conversationJson("conv-b", "Second", "A long enough second message about something."),
    ];

    // Interrupt right after the first conversation has been analyzed.
    const signal = { aborted: false };
    const interrupted = await coordinator.run([new StubAdapter(entries)], {
      mode: "import",
      signal,
      onProgress: (progress) => {
        if (progress.phase === "analyzing" && progress.processed >= 1) signal.aborted = true;
      },
    });

    expect(interrupted.aborted).toBe(true);
    expect(manifest.status().processed).toBe(1);
    // Layer A ran for everything first, so no conversation was lost.
    expect(manifest.status().archived).toBe(2);
    expect(manifest.pendingConversationIds(1)).toHaveLength(1);

    const archive = stores.get("mybrain")!;
    const resumeAdapter = new ArchiveSourceAdapter(
      archive,
      "90 ChatGPT Sources",
      new Set(manifest.pendingConversationIds(1))
    );
    const resumed = await coordinator.run([resumeAdapter], { mode: "resume" });

    expect(resumed.aborted).toBe(false);
    expect(resumed.run.conversationsProcessed).toBe(1);
    expect(manifest.status().processed).toBe(2);
    expect(manifest.pendingConversationIds(1)).toHaveLength(0);
    expect(archive.files.has("06 Progress/Lessons/One.md")).toBe(true);
    expect(archive.files.has("06 Progress/Lessons/Two.md")).toBe(true);
  });

  it("holds low-confidence meaning for review instead of guessing", async () => {
    const { coordinator, manifest, stores, model } = await harness();
    model.register("Vague", {
      units: [
        { kind: "other", title: "Something unclear", content: "A fragment with no clear home.", confidence: 0.2 },
      ],
    });

    const summary = await coordinator.run(
      [new StubAdapter([conversationJson("conv-vague", "Vague", "A fragment with no clear home at all.")])],
      { mode: "import" }
    );

    expect(summary.run.unitsQueuedForReview).toBe(1);
    expect(manifest.reviewQueue()).toHaveLength(1);

    const mybrain = stores.get("mybrain")!;
    expect(mybrain.files.has("99 System/Uncategorized/Something unclear.md")).toBe(true);
    const queue = mybrain.files.get("99 System/Review Queue.md")!;
    expect(queue).toContain("Something unclear");
  });

  it("archives a throwaway conversation but does not pay a model call for it", async () => {
    const { coordinator, stores, model } = await harness({
      settings: settings({ knowledgeMinConversationChars: 200 }),
    });

    const summary = await coordinator.run([new StubAdapter([conversationJson("conv-tiny", "Tiny", "hi")])], {
      mode: "import",
    });

    expect(model.calls).toBe(0);
    expect(summary.run.conversationsSkipped).toBe(1);
    expect([...stores.get("mybrain")!.files.keys()].some((path) => path.startsWith("90 ChatGPT Sources"))).toBe(true);
  });

  it("records a failure without losing the archived source, and retries it later", async () => {
    const { coordinator, manifest, stores, model } = await harness();
    model.register("Flaky", {
      units: [
        {
          kind: "insight",
          title: "Later",
          content: "Recovered insight.",
          primaryVault: "Mybrain.Leander",
          confidence: 0.9,
        },
      ],
    });
    model.failuresLeft = 5;

    const failed = await coordinator.run(
      [new StubAdapter([conversationJson("conv-flaky", "Flaky", "A message long enough to be analyzed.")])],
      { mode: "import" }
    );

    expect(failed.run.conversationsFailed).toBe(1);
    expect(manifest.failedConversationIds()).toEqual(["conv-flaky"]);
    expect([...stores.get("mybrain")!.files.keys()].some((path) => path.startsWith("90 ChatGPT Sources"))).toBe(true);

    model.failuresLeft = 0;
    const archive = stores.get("mybrain")!;
    const retried = await coordinator.run(
      [new ArchiveSourceAdapter(archive, "90 ChatGPT Sources", new Set(["conv-flaky"]))],
      { mode: "resume", force: true }
    );

    expect(retried.run.conversationsProcessed).toBe(1);
    expect(manifest.failedConversationIds()).toEqual([]);
  });

  it("plans a dry run without writing anything", async () => {
    const { coordinator, stores, manifest, model } = await harness();
    model.register("Clarity profiles", SPLIT_ANALYSIS);

    const summary = await coordinator.run(
      [new StubAdapter([conversationJson("conv-dry", "Clarity profiles", "How should Clarity store profiles?")])],
      { mode: "reconcile", dryRun: true }
    );

    expect(stores.get("mybrain")!.files.size).toBe(0);
    expect(stores.get("clarity")!.files.size).toBe(0);
    expect(manifest.status().totalKnown).toBe(0);
    expect(summary.routingPreview.map((preview) => preview.vault).sort()).toEqual(["Clarity", "Mybrain.Leander"]);
    expect([...(summary.plannedWrites?.get("clarity") || [])]).toContain("Backend/Profile architecture.md");
  });

  it("runs a source-only import without calling the model", async () => {
    const { coordinator, stores, model } = await harness();
    const summary = await coordinator.run(
      [new StubAdapter([conversationJson("conv-src", "Source only", "A message long enough to be analyzed.")])],
      { mode: "source-only" }
    );

    expect(model.calls).toBe(0);
    expect(summary.run.conversationsArchived).toBe(1);
    expect(
      [...stores.get("mybrain")!.files.keys()].filter((path) => path.startsWith("90 ChatGPT Sources"))
    ).toHaveLength(1);
  });

  it("writes a dream note, symbol notes and a dream atlas", async () => {
    const { coordinator, stores, model } = await harness();
    model.register("Dream talk", {
      units: [
        {
          kind: "dream",
          title: "Being chased",
          content: "I was running through a city and my legs were heavy.",
          primaryVault: "Mybrain.Leander",
          symbols: ["Heavy legs"],
          emotions: ["fear"],
          concepts: ["Avoidance"],
          confidence: 0.9,
          occurredOn: "2025-01-01",
        },
      ],
    });

    await coordinator.run(
      [new StubAdapter([conversationJson("conv-dream", "Dream talk", "I dreamt I was being chased through a city.")])],
      { mode: "import" }
    );

    const mybrain = stores.get("mybrain")!;
    expect([...mybrain.files.keys()].some((path) => path.startsWith("04 Dreams/Dreams/Dream - 2025-01-01"))).toBe(true);
    expect(mybrain.files.has("04 Dreams/Symbols/Heavy legs.md")).toBe(true);

    const atlas = mybrain.files.get("00 HOME/Dream Atlas.md")!;
    expect(atlas).toContain("Dreams recorded: 1");
    expect(atlas).toContain("[[Heavy legs]]");
    expect(atlas).toContain("Frequency is not significance");
  });
});
