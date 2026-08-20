import { SemanticUnit } from "src/Models/Knowledge/SemanticUnit";
import { ImportManifestService } from "./ImportManifestService";
import { MemoryVaultStore } from "./KnowledgeFileStore";
import { SemanticNoteResolver } from "./SemanticNoteResolver";

async function harness(seed: Record<string, string> = {}) {
  const manifest = new ImportManifestService(
    new MemoryVaultStore("p", "p"),
    "m.json",
    () => "2026-01-01T00:00:00.000Z"
  );
  await manifest.load();
  return { manifest, resolver: new SemanticNoteResolver(manifest), store: new MemoryVaultStore("v", "Vault", seed) };
}

function unit(title: string): SemanticUnit {
  return {
    id: "u",
    kind: "pattern",
    title,
    content: "content",
    concepts: [],
    entities: [],
    confidence: 0.9,
    sourceMessageIds: [],
  };
}

describe("SemanticNoteResolver", () => {
  it("creates a new note when nothing comparable exists", async () => {
    const { resolver, store } = await harness();
    const resolved = await resolver.resolve(unit("Control"), "v", "03 Patterns", store);

    expect(resolved).toMatchObject({ path: "03 Patterns/Control.md", isNew: true, matchedBy: "new" });
  });

  it("reuses a note the person created by hand", async () => {
    const { resolver, store } = await harness({ "03 Patterns/Control.md": "# Control\n" });
    const resolved = await resolver.resolve(unit("control"), "v", "03 Patterns", store);

    expect(resolved.path).toBe("03 Patterns/Control.md");
    expect(resolved.matchedBy).toBe("exact-title");
    expect(resolved.isNew).toBe(false);
  });

  it("treats surface variants of one concept as the same note", async () => {
    const { resolver, store } = await harness({ "02 Inner Life/Fear/Fear of judgment.md": "# Fear of judgment\n" });

    for (const variant of ["Fear of being judged", "Judgment anxiety", "fear of judgement"]) {
      const resolved = await resolver.resolve(unit(variant), "v", "02 Inner Life/Fear", store);
      expect(resolved.path).toBe("02 Inner Life/Fear/Fear of judgment.md");
    }
  });

  it("does not merge concepts that only share a word", async () => {
    const { resolver, store } = await harness({ "02 Inner Life/Fear/Fear of judgment.md": "# Fear of judgment\n" });
    const resolved = await resolver.resolve(unit("Fear of death"), "v", "02 Inner Life/Fear", store);

    expect(resolved.path).toBe("02 Inner Life/Fear/Fear of death.md");
    expect(resolved.isNew).toBe(true);
  });

  it("remembers a resolution in the registry so later runs skip the scan", async () => {
    const { manifest, resolver, store } = await harness();
    const first = await resolver.resolve(unit("Control"), "v", "03 Patterns", store);
    resolver.register(first, "v", "pattern", "Control", "2025-01-01");
    await store.write(first.path, "# Control\n");

    const again = await resolver.resolve(unit("Control"), "v", "03 Patterns", store);
    expect(again.matchedBy).toBe("registry");
    expect(manifest.listConcepts()).toHaveLength(1);
  });

  it("follows a registered alias to the canonical note", async () => {
    const { resolver, store } = await harness({ "03 Patterns/Urgency.md": "# Urgency\n" });
    const resolved = await resolver.resolve(unit("Urgency"), "v", "03 Patterns", store);
    resolver.register(resolved, "v", "pattern", "Everything feels urgent", "2025-01-01");

    const viaAlias = await resolver.resolve(unit("Everything feels urgent"), "v", "03 Patterns", store);
    expect(viaAlias.path).toBe("03 Patterns/Urgency.md");
    expect(viaAlias.matchedBy).toBe("alias");
  });

  it("keeps concepts with the same name in different vaults apart", async () => {
    const { resolver, store } = await harness();
    const personal = await resolver.resolve(unit("Identity"), "mybrain", "01 Self/Identity", store);
    resolver.register(personal, "mybrain", "pattern", "Identity");

    const project = await resolver.resolve(unit("Identity"), "clarity", "Product", store);
    expect(project.path).toBe("Product/Identity.md");
    expect(project.key).not.toBe(personal.key);
  });
});
