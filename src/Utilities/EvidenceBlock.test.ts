import {
  evidenceDateRange,
  mergeEvidence,
  parseEvidenceBlock,
  renderEvidenceBlock,
  renderEvidenceLine,
} from "./EvidenceBlock";

function entry(unitId: string, date: string | undefined, text: string) {
  const line = renderEvidenceLine({ unitId, conversationId: "conv-1", date, text });
  return { unitId, conversationId: "conv-1", date, line };
}

describe("evidence lines", () => {
  it("carries the unit id so re-runs can merge instead of duplicating", () => {
    const line = renderEvidenceLine({
      unitId: "u1",
      conversationId: "conv-1",
      date: "2025-03-04",
      text: "I notice I make projects too large.",
      sourceLink: "[[90 ChatGPT Sources/2025/Note|Talking about Clarity]]",
    });

    expect(line).toContain("**2025-03-04**");
    expect(line).toContain("[[90 ChatGPT Sources/2025/Note|Talking about Clarity]]");
    expect(line).toContain("<!-- unit:u1 conv:conv-1 -->");
  });

  it("marks interpretations as interpretations", () => {
    const line = renderEvidenceLine({
      unitId: "u2",
      conversationId: "c",
      text: "this may point at a fear of judgment",
      interpretation: true,
    });
    expect(line).toContain("possible interpretation - ");
  });

  it("round-trips through parsing", () => {
    const parsed = parseEvidenceBlock(renderEvidenceBlock([entry("u1", "2024-05-01", "first")]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].unitId).toBe("u1");
    expect(parsed[0].date).toBe("2024-05-01");
  });
});

describe("mergeEvidence", () => {
  it("keeps existing lines untouched and never duplicates a unit", () => {
    const existing = [entry("u1", "2024-05-01", "original wording")];
    const incoming = [entry("u1", "2024-05-01", "reworded by a newer model"), entry("u2", "2025-01-02", "new")];

    const merged = mergeEvidence(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].line).toContain("original wording");
  });
});

describe("renderEvidenceBlock", () => {
  it("groups evidence by year so change over time stays visible", () => {
    const block = renderEvidenceBlock([
      entry("u2", "2026-02-02", "later thought"),
      entry("u1", "2024-05-01", "earlier thought"),
      entry("u3", undefined, "undated thought"),
    ]);

    const years = block.match(/### \S+/g);
    expect(years).toEqual(["### 2024", "### 2026", "### undated"]);
    expect(block.indexOf("earlier thought")).toBeLessThan(block.indexOf("later thought"));
  });

  it("says so when there is no evidence yet", () => {
    expect(renderEvidenceBlock([])).toBe("_No evidence recorded yet._");
  });
});

describe("evidenceDateRange", () => {
  it("reports first and last observation", () => {
    const range = evidenceDateRange([entry("a", "2025-06-06", "x"), entry("b", "2023-01-01", "y")]);
    expect(range).toEqual({ first: "2023-01-01", last: "2025-06-06" });
  });
});
