import { ImportManifestService } from "./ImportManifestService";
import { MemoryVaultStore } from "./KnowledgeFileStore";

async function harness(seed: Record<string, string> = {}) {
  const store = new MemoryVaultStore("p", "p", seed);
  const manifest = new ImportManifestService(store, "manifest.json", () => "2026-08-20T10:00:00.000Z");
  await manifest.load();
  return { store, manifest };
}

describe("ImportManifestService change detection", () => {
  it("treats a first sighting as new work", async () => {
    const { manifest } = await harness();
    const sighting = manifest.registerSighting("conv-1", "Title", "hash-1", 4);

    expect(sighting).toMatchObject({ changed: true, needsArchive: true, needsSemantic: true });
    expect(manifest.status().totalKnown).toBe(1);
  });

  it("skips an unchanged conversation that is already processed", async () => {
    const { manifest } = await harness();
    manifest.registerSighting("conv-1", "Title", "hash-1", 4);
    manifest.markArchived("conv-1", "sources/conv-1.md", "hash-1");
    manifest.markProcessed("conv-1", ["u1"], 1, 500);

    const again = manifest.registerSighting("conv-1", "Title", "hash-1", 4, 1);
    expect(again).toMatchObject({ changed: false, needsArchive: false, needsSemantic: false });
  });

  it("detects that a conversation grew and needs reprocessing", async () => {
    const { manifest } = await harness();
    manifest.registerSighting("conv-1", "Title", "hash-1", 20);
    manifest.markArchived("conv-1", "sources/conv-1.md", "hash-1");
    manifest.markProcessed("conv-1", ["u1"], 1, 500);

    const changed = manifest.registerSighting("conv-1", "Title", "hash-2", 32, 1);
    expect(changed).toMatchObject({ changed: true, needsArchive: true, needsSemantic: true });
    expect(changed.record.messageCount).toBe(32);
  });

  it("re-runs a conversation when the processing version moved on", async () => {
    const { manifest } = await harness();
    manifest.registerSighting("conv-1", "Title", "hash-1", 4);
    manifest.markArchived("conv-1", "sources/conv-1.md", "hash-1");
    manifest.markProcessed("conv-1", ["u1"], 1, 500);

    const sighting = manifest.registerSighting("conv-1", "Title", "hash-1", 4, 2);
    expect(sighting.needsSemantic).toBe(true);
    expect(sighting.needsArchive).toBe(false);
    expect(manifest.status(2).staleProcessingVersion).toBe(1);
  });

  it("lists pending and failed conversations for resume and retry", async () => {
    const { manifest } = await harness();
    manifest.registerSighting("a", "A", "h", 2);
    manifest.registerSighting("b", "B", "h", 2);
    manifest.markArchived("b", "sources/b.md", "h");
    manifest.markProcessed("b", [], 1, 0);
    manifest.registerSighting("c", "C", "h", 2);
    manifest.markFailed("c", "rate limited");

    expect(manifest.pendingConversationIds(1).sort()).toEqual(["a", "c"]);
    expect(manifest.failedConversationIds()).toEqual(["c"]);
    expect(manifest.status().failed).toBe(1);
  });

  it("survives a round trip through storage", async () => {
    const { manifest, store } = await harness();
    manifest.registerSighting("conv-1", "Title", "hash-1", 4);
    manifest.markArchived("conv-1", "sources/conv-1.md", "hash-1");
    await manifest.save(true);

    const reloaded = new ImportManifestService(store, "manifest.json");
    await reloaded.load();
    expect(reloaded.getConversation("conv-1")?.sourcePath).toBe("sources/conv-1.md");
  });

  it("starts a fresh manifest when the stored file is corrupt", async () => {
    const { manifest } = await harness({ "manifest.json": "{not json" });
    expect(manifest.status().totalKnown).toBe(0);
  });

  it("does not stack duplicate review entries for the same unit", async () => {
    const { manifest } = await harness();
    const entry = {
      unitId: "u1",
      conversationId: "conv-1",
      conversationTitle: "T",
      kind: "insight",
      title: "X",
      excerpt: "Y",
      confidence: 0.3,
      reason: "unclear",
      status: "uncategorized" as const,
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    manifest.addReviewEntry(entry);
    manifest.addReviewEntry(entry);
    expect(manifest.reviewQueue()).toHaveLength(1);

    manifest.clearReviewEntriesForConversation("conv-1");
    expect(manifest.reviewQueue()).toHaveLength(0);
  });

  it("keeps the widest observed date range for a concept", async () => {
    const { manifest } = await harness();
    const base = {
      key: "v:control",
      title: "Control",
      vaultId: "v",
      path: "p.md",
      aliases: ["Control"],
      kind: "pattern",
    };
    manifest.putConcept({ ...base, firstObserved: "2025-01-01", lastObserved: "2025-01-01" });
    manifest.putConcept({ ...base, aliases: ["controlling"], firstObserved: "2024-01-01", lastObserved: "2026-01-01" });

    const concept = manifest.getConcept("v:control")!;
    expect(concept.firstObserved).toBe("2024-01-01");
    expect(concept.lastObserved).toBe("2026-01-01");
    expect(concept.aliases.sort()).toEqual(["Control", "controlling"]);
  });
});
