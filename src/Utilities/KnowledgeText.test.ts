import {
  conceptSimilarity,
  isoDate,
  joinPath,
  normalizeConceptKey,
  obsidianUri,
  readManagedBlock,
  sanitizeNoteName,
  splitNote,
  upsertFrontmatterFields,
  upsertManagedBlock,
} from "./KnowledgeText";

describe("sanitizeNoteName", () => {
  it("removes characters that break Obsidian file names", () => {
    expect(sanitizeNoteName("Fear of: judgment/doubt?")).toBe("Fear of- judgment-doubt-");
    expect(sanitizeNoteName("   ")).toBe("Untitled");
  });
});

describe("normalizeConceptKey", () => {
  it("collapses surface variants of the same concept", () => {
    expect(normalizeConceptKey("Fear of judgment")).toBe(normalizeConceptKey("fear of being judged"));
    expect(normalizeConceptKey("Judgment anxiety")).toBe(normalizeConceptKey("Fear of judgment"));
    expect(normalizeConceptKey("Control")).toBe(normalizeConceptKey("controlling"));
  });

  it("keeps genuinely different concepts apart", () => {
    expect(normalizeConceptKey("Fear of judgment")).not.toBe(normalizeConceptKey("Fear of death"));
    expect(conceptSimilarity("Fear of judgment", "Fear of death")).toBeLessThan(0.8);
    expect(conceptSimilarity("Control", "Urgency")).toBe(0);
  });
});

describe("upsertFrontmatterFields", () => {
  it("adds frontmatter to a note that has none", () => {
    const result = upsertFrontmatterFields("# Control\n\nSome text\n", { type: "concept" });
    expect(result).toBe("---\ntype: concept\n---\n\n# Control\n\nSome text\n");
  });

  it("replaces only the keys it owns and preserves everything else", () => {
    const note = ["---", "type: concept", "tags:", "  - mine", "cssclass: fancy", "---", "", "# Control", ""].join(
      "\n"
    );
    const result = upsertFrontmatterFields(note, { type: "pattern", first_observed: "2024-01-01" });

    expect(result).toContain("type: pattern");
    expect(result).toContain("tags:\n  - mine");
    expect(result).toContain("cssclass: fancy");
    expect(result).toContain("first_observed: 2024-01-01");
    expect(result).toContain("# Control");
  });

  it("replaces list values without leaking old entries", () => {
    const note = ["---", "symbols:", "  - old", "  - older", "---", "", "body"].join("\n");
    const result = upsertFrontmatterFields(note, { symbols: ["new"] });
    expect(result).toContain("symbols:\n  - new");
    expect(result).not.toContain("older");
  });

  it("writes structured cross-vault references", () => {
    const result = upsertFrontmatterFields("body", {
      related_external: [{ vault: "Clarity", file: "Product/Profiles" }],
    });
    expect(result).toContain("related_external:\n  - vault: Clarity\n    file: Product/Profiles");
  });
});

describe("managed blocks", () => {
  const human = ["# Control", "", "## What I mean by this", "", "My own words, untouched.", ""].join("\n");

  it("appends a block under a heading and keeps human text", () => {
    const result = upsertManagedBlock(human, "evidence", "## Evidence / Sources", "- first");
    expect(result).toContain("My own words, untouched.");
    expect(result).toContain("## Evidence / Sources");
    expect(readManagedBlock(result, "evidence")).toBe("- first");
  });

  it("rewrites only the block contents on later runs", () => {
    const once = upsertManagedBlock(human, "evidence", "## Evidence / Sources", "- first");
    const edited = once.replace("My own words, untouched.", "My own words, edited later.");
    const twice = upsertManagedBlock(edited, "evidence", "## Evidence / Sources", "- first\n- second");

    expect(twice).toContain("My own words, edited later.");
    expect(readManagedBlock(twice, "evidence")).toBe("- first\n- second");
    expect(twice.match(/## Evidence \/ Sources/g)).toHaveLength(1);
  });

  it("returns null when the block is absent", () => {
    expect(readManagedBlock(human, "evidence")).toBeNull();
  });
});

describe("splitNote", () => {
  it("separates frontmatter from body", () => {
    const note = "---\na: 1\n---\n\n# Title\n";
    expect(splitNote(note)).toEqual({ frontmatter: ["a: 1"], body: "# Title\n", hasFrontmatter: true });
  });

  it("treats a note without frontmatter as pure body", () => {
    expect(splitNote("# Title").hasFrontmatter).toBe(false);
  });
});

describe("cross-vault links", () => {
  it("encodes vault and file for obsidian:// URLs", () => {
    expect(obsidianUri("Mybrain.Leander", "90 ChatGPT Sources/2025/A note.md")).toBe(
      "obsidian://open?vault=Mybrain.Leander&file=90%20ChatGPT%20Sources%2F2025%2FA%20note"
    );
  });
});

describe("misc helpers", () => {
  it("joins paths without empty segments", () => {
    expect(joinPath("a", "", "/b/", "c")).toBe("a/b/c");
  });

  it("converts unix seconds to an ISO date", () => {
    expect(isoDate(1700000000)).toBe("2023-11-14");
    expect(isoDate(undefined)).toBeUndefined();
  });
});
