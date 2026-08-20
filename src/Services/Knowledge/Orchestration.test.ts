import { SemanticUnit, SemanticUnitKind } from "src/Models/Knowledge/SemanticUnit";
import { CapabilityFlags, emptyCapabilityFlags, KnowledgeCapability } from "src/Models/Knowledge/PluginCapability";
import { ImportManifestService } from "./ImportManifestService";
import { MemoryVaultStore } from "./KnowledgeFileStore";
import { KnowledgeWriterService, WriteContext } from "./KnowledgeWriterService";
import { SemanticNoteResolver } from "./SemanticNoteResolver";
import { KnowledgeHomeService, HOME_NOTE } from "./KnowledgeHomeService";
import { CanvasProjectionService, MANAGED_CANVAS_FOLDER } from "./CanvasProjectionService";
import { KnowledgeTemplateService } from "./KnowledgeTemplateService";
import { CaptureService } from "./CaptureService";
import { DailyNoteService, formatDailyNoteName, parseDailyNoteSettings } from "./DailyNoteService";
import { VaultEnhancementService } from "./VaultEnhancementService";
import { parseGitRemotes, RepositorySafetyService, sanitizeRemote } from "./RepositorySafetyService";
import { assertReadablePath, excerptOf, KnowledgeApiError } from "./KnowledgeApiService";
import { splitNote } from "src/Utilities/KnowledgeText";

/**
 * The orchestration contract: optional plugins may add things, but nothing they
 * add may be load-bearing. A note written for a vault with thirty plugins and
 * the same note written for a bare Markdown vault must carry identical
 * knowledge.
 */

const CONTEXT: WriteContext = {
  archiveVaultId: "mybrain",
  archiveVaultName: "Mybrain",
  personalVaultId: "mybrain",
  processingVersion: 1,
  importedAt: "2026-08-20T10:00:00.000Z",
};

function capabilities(...enabled: KnowledgeCapability[]): CapabilityFlags {
  const flags = emptyCapabilityFlags();
  enabled.forEach((capability) => (flags[capability] = true));
  return flags;
}

function unit(
  overrides: Partial<SemanticUnit> & { kind: SemanticUnitKind; title: string; content: string }
): SemanticUnit {
  return {
    id: "unit-1",
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

async function harness(seed: Record<string, string> = {}) {
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
    store: new MemoryVaultStore("mybrain", "Mybrain", seed),
    writer: new KnowledgeWriterService(resolver, manifest),
  };
}

const CONVERSATION = {
  conversationId: "conv-1",
  title: "A talk",
  date: "2026-01-01",
  sourcePath: "90 ChatGPT Sources/2026/A talk.md",
};

function writeRequest(store: MemoryVaultStore, flags: CapabilityFlags) {
  return {
    unit: unit({
      kind: "pattern",
      title: "Control",
      content: "Takes control when uncertain.",
      concepts: ["Uncertainty"],
    }),
    decision: {
      unitId: "unit-1",
      vaultId: "mybrain",
      vaultName: "Mybrain",
      folder: "03 Patterns",
      confidence: 0.9,
      status: "auto" as const,
      reason: "test",
    },
    conversation: CONVERSATION,
    store,
    existingFolders: ["03 Patterns"],
    capabilities: flags,
  };
}

describe("the same knowledge is written whatever the vault has installed", () => {
  it("produces an identical note body with and without plugins", async () => {
    const rich = await harness();
    const bare = await harness();

    await rich.writer.writeUnit(
      writeRequest(rich.store, capabilities("query-engine", "tasks", "semantic-search", "drawing", "icons")),
      CONTEXT
    );
    await bare.writer.writeUnit(writeRequest(bare.store, emptyCapabilities()), CONTEXT);

    const richNote = splitNote((await rich.store.read("03 Patterns/Control.md"))!);
    const bareNote = splitNote((await bare.store.read("03 Patterns/Control.md"))!);

    // Bodies are byte-identical: evidence, provenance and links do not vary.
    expect(richNote.body).toBe(bareNote.body);

    // The only difference is decoration the vault can actually render.
    const extraKeys = richNote.frontmatter.filter((line) => !bareNote.frontmatter.includes(line));
    expect(extraKeys).toEqual(["icon: LiBrain"]);
  });

  it("writes no plugin-specific syntax at all into a bare vault", async () => {
    const { writer, store } = await harness();
    await writer.writeUnit(writeRequest(store, emptyCapabilities()), CONTEXT);

    const content = (await store.read("03 Patterns/Control.md"))!;
    expect(content).not.toContain("```dataview");
    expect(content).not.toContain("```tasks");
    expect(content).not.toContain("icon:");
    expect(content).toContain("[[Uncertainty]]");
    expect(content).toContain("source_conversations:");
  });
});

function emptyCapabilities(): CapabilityFlags {
  return emptyCapabilityFlags();
}

describe("home note adapts to the destination vault", () => {
  async function homeFor(flags: CapabilityFlags) {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "mybrain:control",
      title: "Control",
      vaultId: "mybrain",
      path: "03 Patterns/Control.md",
      aliases: [],
      kind: "pattern",
      lastObserved: "2026-01-01",
    });
    await new KnowledgeHomeService(manifest).writeHome(store, flags);
    return (await store.read(HOME_NOTE))!;
  }

  it("uses live queries where a query engine exists", async () => {
    const content = await homeFor(capabilities("query-engine"));
    expect(content).toContain("```dataview");
    // The generated list is kept as well, so removing Dataview loses nothing.
    expect(content).toContain("[[03 Patterns/Control|Control]]");
    expect(content).toContain("if Dataview is removed");
  });

  it("falls back to generated lists without one", async () => {
    const content = await homeFor(emptyCapabilities());
    expect(content).not.toContain("```dataview");
    expect(content).toContain("[[03 Patterns/Control|Control]]");
  });

  it("never overwrites what the person wrote in the home note", async () => {
    const { manifest, store } = await harness({
      [HOME_NOTE]: ["# Knowledge Home", "", "## Mine", "", "My own opening paragraph.", ""].join("\n"),
    });
    await new KnowledgeHomeService(manifest).writeHome(store, emptyCapabilities());

    const content = (await store.read(HOME_NOTE))!;
    expect(content).toContain("My own opening paragraph.");
    expect(content).toContain("## Overview");
  });
});

describe("actions blocks degrade to plain checkboxes", () => {
  const enhancements = new VaultEnhancementService();

  it("uses a live Tasks query when Tasks is enabled", () => {
    const block = enhancements.renderActionsBlock(capabilities("tasks"), "Song Idea", ["Record a demo"]);
    expect(block).toContain("```tasks");
    expect(block).toContain("The checkboxes themselves are plain Markdown");
  });

  it("writes ordinary checkboxes when it is not", () => {
    const block = enhancements.renderActionsBlock(emptyCapabilities(), "Song Idea", ["Record a demo"]);
    expect(block).toBe("- [ ] Record a demo");
    expect(block).not.toContain("```");
  });
});

describe("canvas projections", () => {
  it("does nothing when Canvas is disabled in that vault", async () => {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "a",
      title: "Control",
      vaultId: "mybrain",
      path: "03 Patterns/Control.md",
      aliases: [],
      kind: "pattern",
    });

    expect(await new CanvasProjectionService(manifest).generate(store, emptyCapabilities())).toEqual([]);
    expect(store.files.size).toBe(0);
  });

  it("writes managed canvases into one clearly marked folder", async () => {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "a",
      title: "Control",
      vaultId: "mybrain",
      path: "03 Patterns/Control.md",
      aliases: [],
      kind: "pattern",
    });

    const paths = await new CanvasProjectionService(manifest).generate(store, capabilities("visual-canvas"));
    expect(paths).toEqual([`${MANAGED_CANVAS_FOLDER}/Patterns.canvas`]);

    const canvas = JSON.parse((await store.read(paths[0]))!);
    expect(canvas.nodes[0].text).toContain("Canvases outside this folder are never touched");
    expect(canvas.nodes[1]).toMatchObject({ type: "file", file: "03 Patterns/Control.md" });
  });

  it("leaves retired readings out of the projection", async () => {
    const { manifest, store } = await harness();
    manifest.putConcept({
      key: "a",
      title: "Kept",
      vaultId: "mybrain",
      path: "03 Patterns/Kept.md",
      aliases: [],
      kind: "pattern",
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

    await new CanvasProjectionService(manifest).generate(store, capabilities("visual-canvas"));
    const canvas = (await store.read(`${MANAGED_CANVAS_FOLDER}/Patterns.canvas`))!;
    expect(canvas).toContain("Kept.md");
    expect(canvas).not.toContain("Retired.md");
  });
});

describe("templates match the generated schemas", () => {
  it("uses Templater syntax only where Templater is enabled", async () => {
    const withTemplater = new MemoryVaultStore("v", "V");
    const without = new MemoryVaultStore("v", "V");
    const service = new KnowledgeTemplateService();

    await service.install(withTemplater, capabilities("templates"));
    await service.install(without, emptyCapabilities());

    expect((await withTemplater.read("99 System/Templates/Dream.md"))!).toContain("<% tp.date.now");
    const plain = (await without.read("99 System/Templates/Dream.md"))!;
    expect(plain).not.toContain("<%");
    expect(plain).toContain("type: dream");
  });

  it("never overwrites a template the person already has", async () => {
    const store = new MemoryVaultStore("v", "V", { "99 System/Templates/Dream.md": "# my own dream template" });
    const created = await new KnowledgeTemplateService().install(store, emptyCapabilities());

    expect(created).not.toContain("99 System/Templates/Dream.md");
    expect(await store.read("99 System/Templates/Dream.md")).toBe("# my own dream template");
  });
});

describe("manual capture", () => {
  const service = new CaptureService(
    new DailyNoteService(() => new Date("2026-08-20T10:00:00Z")),
    new VaultEnhancementService(),
    () => new Date("2026-08-20T10:00:00Z")
  );

  it("writes plain Markdown marked as human-authored", async () => {
    const store = new MemoryVaultStore("mybrain", "Mybrain");
    const result = await service.capture(store, {
      kind: "idea",
      title: "A small EP",
      body: "Four tracks, one afternoon.",
      capabilities: emptyCapabilities(),
    });

    const content = (await store.read(result.path))!;
    expect(result.path).toBe("06 Progress/Lessons/A small EP.md");
    expect(content).toContain("authored: human");
    expect(content).toContain("layer: trace");
    expect(content).toContain("Four tracks, one afternoon.");
    expect(result.dailyNotePath).toBeNull();
  });

  it("keeps the author's words and my reading apart for source annotations", async () => {
    const store = new MemoryVaultStore("mybrain", "Mybrain");
    const result = await service.capture(store, {
      kind: "source-annotation",
      title: "On solitude",
      body: "Quote from page 41.",
      source: "book.pdf p41",
      capabilities: emptyCapabilities(),
    });

    const content = (await store.read(result.path))!;
    expect(content).toContain("## What the author said");
    expect(content).toContain("## My reading of it");
    expect(content).toContain("source: book.pdf p41");
  });

  it("adds to an existing capture instead of replacing it", async () => {
    const store = new MemoryVaultStore("mybrain", "Mybrain", {
      "06 Progress/Lessons/A small EP.md": "# A small EP\n\nOriginal thought.\n",
    });
    await service.capture(store, {
      kind: "idea",
      title: "A small EP",
      body: "A later thought.",
      capabilities: emptyCapabilities(),
    });

    const content = (await store.read("06 Progress/Lessons/A small EP.md"))!;
    expect(content).toContain("Original thought.");
    expect(content).toContain("A later thought.");
  });

  it("links into the daily note only where daily notes exist", async () => {
    const store = new MemoryVaultStore("mybrain", "Mybrain", { "2026-08-20.md": "# 2026-08-20\n" });
    const result = await service.capture(store, {
      kind: "dream",
      title: "Trains",
      capabilities: capabilities("daily-notes"),
    });

    expect(result.dailyNotePath).toBe("2026-08-20.md");
    const daily = (await store.read("2026-08-20.md"))!;
    expect(daily).toContain("## Knowledge captured");
    expect(daily).toContain("Dream - 2026-08-20 - Trains");
    // A reference, never the content itself.
    expect(daily.length).toBeLessThan(400);
  });
});

describe("daily notes", () => {
  it("honours Obsidian's own folder and format settings", async () => {
    expect(parseDailyNoteSettings(JSON.stringify({ folder: "Journal", format: "YYYY-MM-DD" }))).toEqual({
      folder: "Journal",
      format: "YYYY-MM-DD",
    });
    expect(parseDailyNoteSettings("{broken")).toEqual({ folder: "", format: "YYYY-MM-DD" });
    expect(formatDailyNoteName(new Date("2026-08-20T00:00:00Z"), "YYYY/MM/YYYY-MM-DD")).toBe("2026/08/2026-08-20");
  });

  it("does not manufacture daily notes during a bulk import", async () => {
    const store = new MemoryVaultStore("v", "V");
    const path = await new DailyNoteService(() => new Date("2026-08-20T10:00:00Z")).recordKnowledge(
      store,
      capabilities("daily-notes"),
      [{ path: "03 Patterns/Control.md", title: "Control", kind: "Pattern" }]
    );

    expect(path).toBeNull();
    expect(store.files.size).toBe(0);
  });
});

describe("repository safety", () => {
  it("reads remotes without leaking credentials", () => {
    const config = [
      '[remote "origin"]',
      "  url = https://user:token@github.com/me/vault.git",
      "  fetch = +refs/heads/*",
    ].join("\n");
    expect(parseGitRemotes(config)).toEqual(["https://github.com/me/vault.git"]);
    expect(sanitizeRemote("https://user:token@example.com/x.git")).toBe("https://example.com/x.git");
  });

  it("warns when a personal vault pushes to a public host", async () => {
    const store = new MemoryVaultStore("mybrain", "Mybrain", {
      ".git/config": '[remote "origin"]\n  url = https://github.com/me/vault.git\n',
    });
    const vault = {
      id: "mybrain",
      name: "Mybrain",
      kind: "personal" as const,
      path: "/v",
      enabled: true,
      origin: "configured" as const,
    };

    const status = await new RepositorySafetyService().inspect(vault, store);
    expect(status.hasPublicRemote).toBe(true);
    expect(status.warnings.join(" ")).toContain("could be pushed off your machine");
    expect(await new RepositorySafetyService().checkArchiveDestination(vault, store)).toHaveLength(1);
  });

  it("says nothing about a vault that is not a repository", async () => {
    const status = await new RepositorySafetyService().inspect(
      { id: "v", name: "V", kind: "personal", path: "/v", enabled: true, origin: "configured" },
      new MemoryVaultStore("v", "V")
    );
    expect(status).toEqual({ isRepository: false, warnings: [] });
  });
});

describe("the external knowledge API keeps configuration out of reach", () => {
  it("refuses configuration, plugin data and traversal", () => {
    expect(() => assertReadablePath(".obsidian/plugins/dataview/data.json")).toThrow(KnowledgeApiError);
    expect(() => assertReadablePath("../../etc/passwd")).toThrow(KnowledgeApiError);
    expect(() => assertReadablePath(".git/config")).toThrow(KnowledgeApiError);
    expect(() => assertReadablePath("knowledge-import-manifest.json")).toThrow(KnowledgeApiError);
    expect(() => assertReadablePath("")).toThrow(KnowledgeApiError);
  });

  it("allows ordinary notes and canvases", () => {
    expect(() => assertReadablePath("03 Patterns/Control.md")).not.toThrow();
    expect(() => assertReadablePath("99 System/Canvases/Patterns.canvas")).not.toThrow();
  });

  it("excerpts around the query without frontmatter or markers", () => {
    const excerpt = excerptOf(
      "---\ntype: concept\n---\n\n# Control\n\nI take control. <!-- unit:x conv:y -->",
      "control"
    );
    expect(excerpt).toContain("I take control");
    expect(excerpt).not.toContain("type: concept");
    expect(excerpt).not.toContain("unit:x");
  });
});
