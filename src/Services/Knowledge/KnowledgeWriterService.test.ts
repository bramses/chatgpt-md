import { SemanticUnit, SemanticUnitKind } from "src/Models/Knowledge/SemanticUnit";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { ImportManifestService } from "./ImportManifestService";
import { MemoryVaultStore } from "./KnowledgeFileStore";
import { KnowledgeWriterService, WriteContext } from "./KnowledgeWriterService";
import { SemanticNoteResolver } from "./SemanticNoteResolver";
import { RoutingDecision } from "./VaultRouterService";
import { readManagedBlock } from "src/Utilities/KnowledgeText";

const CONTEXT: WriteContext = {
  archiveVaultId: "mybrain-leander",
  archiveVaultName: "Mybrain.Leander",
  personalVaultId: "mybrain-leander",
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
    ...overrides,
  } as SemanticUnit;
}

function decision(folder: string, vaultId = "mybrain-leander"): RoutingDecision {
  return {
    unitId: "unit-1",
    vaultId,
    vaultName: "Mybrain.Leander",
    folder,
    confidence: 0.9,
    status: "auto",
    reason: "test",
  };
}

async function harness(vaultId = "mybrain-leander", vaultName = "Mybrain.Leander") {
  const manifestStore = new MemoryVaultStore("plugin", "plugin");
  const manifest = new ImportManifestService(manifestStore, "manifest.json", () => "2026-08-20T10:00:00.000Z");
  await manifest.load();
  const resolver = new SemanticNoteResolver(manifest);
  const store = new MemoryVaultStore(vaultId, vaultName);
  return { manifest, resolver, store, writer: new KnowledgeWriterService(resolver, manifest) };
}

describe("KnowledgeWriterService source archive", () => {
  it("writes a source note once and reports no change on identical content", async () => {
    const { writer, store } = await harness();
    const document = {
      conversationId: "conv-1",
      title: "A talk",
      path: "90 ChatGPT Sources/2025/A talk.md",
      content: "---\ntype: chatgpt-source\n---\n\n# A talk\n",
      contentHash: "hash",
      messageCount: 2,
    };

    expect(await writer.writeSource(store, document)).toBe(true);
    expect(await writer.writeSource(store, document)).toBe(false);
    expect(store.files.size).toBe(1);
  });

  it("stays byte-stable after the processed flag is flipped", async () => {
    const { writer, store } = await harness();
    const normalizer = new ConversationNormalizer();
    const conversation = {
      conversationId: "conv-1",
      title: "A talk",
      createdAt: 1735689600,
      sourceKind: "official-export",
      messages: [
        { id: "m1", role: "user" as const, content: "Hello there." },
        { id: "m2", role: "assistant" as const, content: "Hi." },
      ],
    };
    const options = {
      archiveFolder: "90 ChatGPT Sources",
      importedAt: "2026-08-20T10:00:00.000Z",
      processingVersion: 1,
    };

    await writer.writeSource(store, normalizer.build(conversation, options));
    await writer.markSourceProcessed(store, normalizer.build(conversation, options).path, 1);

    // A later run rebuilds the same conversation: the note must already match,
    // so the archive is not rewritten back and forth between runs.
    const rebuilt = normalizer.build(conversation, { ...options, processed: true });
    expect(await writer.writeSource(store, rebuilt)).toBe(false);
  });

  it("flips processed in the archived source without touching the transcript", async () => {
    const { writer, store } = await harness();
    const path = "90 ChatGPT Sources/2025/A talk.md";
    await store.write(
      path,
      "---\ntype: chatgpt-source\nprocessed: false\nprocessing_version: 0\n---\n\n## User\n\nhello\n"
    );

    await writer.markSourceProcessed(store, path, 3);
    const content = (await store.read(path))!;

    expect(content).toContain("processed: true");
    expect(content).toContain("processing_version: 3");
    expect(content).toContain("## User");
  });
});

describe("KnowledgeWriterService concept notes", () => {
  it("creates a durable note and records provenance", async () => {
    const { writer, store } = await harness();

    const result = await writer.writeUnit(
      {
        unit: unit({
          kind: "pattern",
          title: "Control",
          content: "I take control when I feel uncertain.",
          concepts: ["Uncertainty"],
        }),
        decision: decision("03 Patterns"),
        conversation: {
          conversationId: "conv-1",
          title: "Talking about control",
          date: "2025-03-04",
          sourcePath: "90 ChatGPT Sources/2025/Talking about control.md",
        },
        store,
        existingFolders: ["03 Patterns"],
      },
      CONTEXT
    );

    expect(result.primaryPath).toBe("03 Patterns/Control.md");
    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("type: concept");
    expect(content).toContain("first_observed: 2025-03-04");
    expect(content).toContain("source_conversations:\n  - conv-1");
    expect(content).toContain("[[90 ChatGPT Sources/2025/Talking about control|Talking about control]]");
    expect(content).toContain("[[Uncertainty]]");
  });

  it("merges a second conversation into the same note instead of duplicating it", async () => {
    const { writer, store } = await harness();
    const base = {
      decision: decision("03 Patterns"),
      store,
      existingFolders: ["03 Patterns"],
    };

    await writer.writeUnit(
      {
        ...base,
        unit: unit({ id: "u1", kind: "pattern", title: "Control", content: "First observation." }),
        conversation: { conversationId: "conv-1", title: "One", date: "2024-01-01", sourcePath: "src/one.md" },
      },
      CONTEXT
    );
    await writer.writeUnit(
      {
        ...base,
        unit: unit({ id: "u2", kind: "pattern", title: "controlling", content: "Second observation." }),
        conversation: { conversationId: "conv-2", title: "Two", date: "2026-02-02", sourcePath: "src/two.md" },
      },
      CONTEXT
    );

    const paths = [...store.files.keys()].filter((path) => path.startsWith("03 Patterns"));
    expect(paths).toEqual(["03 Patterns/Control.md"]);

    const content = (await store.read("03 Patterns/Control.md"))!;
    expect(content).toContain("First observation.");
    expect(content).toContain("Second observation.");
    expect(content).toContain("### 2024");
    expect(content).toContain("### 2026");
    expect(content).toContain("first_observed: 2024-01-01");
    expect(content).toContain("last_observed: 2026-02-02");
    expect(content).toContain("source_conversations:\n  - conv-1\n  - conv-2");
  });

  it("is idempotent: writing the same unit twice changes nothing", async () => {
    const { writer, store } = await harness();
    const request = {
      unit: unit({ kind: "insight", title: "Simplicity", content: "Simple is enough." }),
      decision: decision("06 Progress/Lessons"),
      conversation: { conversationId: "conv-1", title: "One", date: "2025-05-05", sourcePath: "src/one.md" },
      store,
      existingFolders: [],
    };

    await writer.writeUnit(request, CONTEXT);
    const first = await store.read("06 Progress/Lessons/Simplicity.md");
    await writer.writeUnit(request, CONTEXT);
    const second = await store.read("06 Progress/Lessons/Simplicity.md");

    expect(second).toBe(first);
    expect((second!.match(/<!-- unit:/g) || []).length).toBe(1);
  });

  it("never overwrites what the person wrote", async () => {
    const { writer, store } = await harness();
    const path = "03 Patterns/Control.md";
    await store.write(
      path,
      [
        "---",
        "type: concept",
        "tags:",
        "  - mine",
        "---",
        "",
        "# Control",
        "",
        "## What I mean by this",
        "",
        "My own words.",
        "",
      ].join("\n")
    );

    await writer.writeUnit(
      {
        unit: unit({ kind: "pattern", title: "Control", content: "Generated observation." }),
        decision: decision("03 Patterns"),
        conversation: { conversationId: "conv-1", title: "One", date: "2025-01-01", sourcePath: "src/one.md" },
        store,
        existingFolders: ["03 Patterns"],
      },
      CONTEXT
    );

    const content = (await store.read(path))!;
    expect(content).toContain("My own words.");
    expect(content).toContain("tags:\n  - mine");
    expect(content).toContain("Generated observation.");
  });

  it("keeps contradictions in a tension block rather than flattening them", async () => {
    const { writer, store } = await harness();
    const result = await writer.writeUnit(
      {
        unit: unit({
          kind: "contradiction",
          title: "Certainty",
          content: "In 2024 I wanted certainty; in 2026 I did not.",
        }),
        decision: decision("01 Self/Contradictions"),
        conversation: { conversationId: "conv-1", title: "One", date: "2026-01-01", sourcePath: "src/one.md" },
        store,
        existingFolders: [],
      },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("## Tension");
    expect(readManagedBlock(content, "tension")).toContain("In 2024 I wanted certainty");
  });
});

describe("KnowledgeWriterService dreams", () => {
  it("writes a dated dream note plus symbol notes with backlinks", async () => {
    const { writer, store } = await harness();

    const result = await writer.writeUnit(
      {
        unit: unit({
          kind: "dream",
          title: "Being chased",
          content: "I was running through a city and my legs were heavy.",
          symbols: ["Heavy legs", "Being chased"],
          emotions: ["fear"],
          people: ["A friend"],
          places: ["A city"],
          concepts: ["Avoidance"],
          occurredOn: "2025-07-07",
        }),
        decision: decision("04 Dreams/Dreams"),
        conversation: { conversationId: "conv-1", title: "Dream talk", date: "2025-07-07", sourcePath: "src/dream.md" },
        store,
        existingFolders: ["04 Dreams/Dreams", "04 Dreams/Symbols"],
      },
      CONTEXT
    );

    expect(result.primaryPath).toBe("04 Dreams/Dreams/Dream - 2025-07-07 - Being chased.md");
    const dream = (await store.read(result.primaryPath))!;
    expect(dream).toContain("type: dream");
    expect(dream).toContain("symbols:\n  - Heavy legs\n  - Being chased");
    expect(dream).toContain("[[Heavy legs]]");
    expect(dream).toContain("Possible readings only");

    const symbol = (await store.read("04 Dreams/Symbols/Heavy legs.md"))!;
    expect(symbol).toContain("type: dream-symbol");
    expect(symbol).toContain("appears in [[Dream - 2025-07-07 - Being chased]]");
    expect(symbol).toContain("appearances: 1");
  });

  it("accumulates appearances on a recurring symbol", async () => {
    const { writer, store } = await harness();
    const shared = { decision: decision("04 Dreams/Dreams"), store, existingFolders: ["04 Dreams/Symbols"] };

    for (const [index, date] of ["2025-01-01", "2025-09-09"].entries()) {
      await writer.writeUnit(
        {
          ...shared,
          unit: unit({
            id: `dream-${index}`,
            kind: "dream",
            title: `Dream ${index}`,
            content: "Running again.",
            symbols: ["Heavy legs"],
            occurredOn: date,
          }),
          conversation: { conversationId: `conv-${index}`, title: "Dream talk", date, sourcePath: "src/dream.md" },
        },
        CONTEXT
      );
    }

    const symbol = (await store.read("04 Dreams/Symbols/Heavy legs.md"))!;
    expect(symbol).toContain("appearances: 2");
    expect(symbol).toContain("first_observed: 2025-01-01");
    expect(symbol).toContain("last_observed: 2025-09-09");
  });
});

describe("KnowledgeWriterService cross-vault provenance", () => {
  it("uses an obsidian:// link and metadata when the archive lives elsewhere", async () => {
    const { writer, store } = await harness("clarity", "Clarity");

    const result = await writer.writeUnit(
      {
        unit: unit({ kind: "project-decision", title: "Profile architecture", content: "Profiles live in Supabase." }),
        decision: { ...decision("Product", "clarity"), vaultName: "Clarity" },
        conversation: {
          conversationId: "conv-9",
          title: "Clarity architecture",
          date: "2025-04-04",
          sourcePath: "90 ChatGPT Sources/2025/Clarity architecture.md",
        },
        store,
        existingFolders: ["Product"],
      },
      CONTEXT
    );

    const content = (await store.read(result.primaryPath))!;
    expect(content).toContain("source_vault: Mybrain.Leander");
    expect(content).toContain("source_path: 90 ChatGPT Sources/2025/Clarity architecture.md");
    expect(content).toContain("obsidian://open?vault=Mybrain.Leander&file=");
    expect(content).not.toContain("[[90 ChatGPT Sources");
    expect(content).toContain("## Summary");
  });
});

describe("KnowledgeWriterService review handling", () => {
  it("preserves low-confidence meaning in an unsorted note", async () => {
    const { writer, store } = await harness();
    const path = await writer.writeUncategorized(
      unit({ kind: "other", title: "Unclear thing", content: "Something I said that did not classify." }),
      { conversationId: "conv-1", title: "One", date: "2025-01-01", sourcePath: "src/one.md" },
      store,
      CONTEXT,
      "No vault matched the content"
    );

    const content = (await store.read(path))!;
    expect(path).toBe("99 System/Uncategorized/Unclear thing.md");
    expect(content).toContain("type: chatgpt-unsorted");
    expect(content).toContain("routing_reason: No vault matched the content");
    expect(content).toContain("Something I said that did not classify.");
  });
});
