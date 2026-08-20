import { NormalizedMessage } from "src/Models/Knowledge/ChatGPTExport";
import {
  classifyOrigin,
  detectRumination,
  guardLanguage,
  questionSimilarity,
  RUMINATION_OPTIONS,
} from "./EpistemicGuards";
import { describeIndependence, evidenceIndependence, EvidenceEntry, renderEvidenceLine } from "./EvidenceBlock";

const MESSAGES: NormalizedMessage[] = [
  { id: "u1", role: "user", content: "I felt uncertain about the trip." },
  { id: "a1", role: "assistant", content: "That may point to an avoidant response to intimacy." },
  { id: "u2", role: "user", content: "Maybe. I went anyway." },
];

describe("classifyOrigin - the anti-feedback-loop safeguard", () => {
  it("treats something the person wrote as their own", () => {
    expect(classifyOrigin(["u1"], MESSAGES, "direct-user-statement")).toEqual({
      origin: "user-originated",
      resolved: true,
    });
  });

  it("treats an old AI interpretation as assistant material, not as evidence", () => {
    expect(classifyOrigin(["a1"], MESSAGES, "direct-user-statement")).toEqual({
      origin: "assistant-originated",
      resolved: true,
    });
  });

  it("counts a unit grounded in both as user-originated", () => {
    expect(classifyOrigin(["a1", "u2"], MESSAGES, "inference").origin).toBe("user-originated");
  });

  it("still catches a declared assistant interpretation when ids do not resolve", () => {
    expect(classifyOrigin([], MESSAGES, "assistant-interpretation")).toEqual({
      origin: "assistant-originated",
      resolved: false,
    });
  });
});

describe("guardLanguage - ordinary experience stays ordinary", () => {
  it("flags clinical vocabulary the system introduced", () => {
    const result = guardLanguage("This looks like avoidance and self-sabotage.", "I did not want to go.");
    expect(result.introducedClinicalTerms).toEqual(expect.arrayContaining(["avoidance", "self-sabotage"]));
  });

  it("allows clinical words the person used themselves", () => {
    const result = guardLanguage("They describe avoidance here.", "I know this is avoidance, I have read about it.");
    expect(result.introducedClinicalTerms).toEqual([]);
  });

  it("always flags essentializing language, whoever used it", () => {
    const result = guardLanguage(
      "This is the core wound that defines you.",
      "my core wound, as my therapist called it"
    );
    expect(result.essentialistTerms.length).toBeGreaterThan(0);
  });

  it("passes plain description through untouched", () => {
    expect(guardLanguage("He wanted to leave the party early.", "I wanted to leave the party early.")).toEqual({
      introducedClinicalTerms: [],
      essentialistTerms: [],
    });
  });
});

describe("detectRumination - the same question in new words", () => {
  const history = [
    { question: "What if I actually do not trust myself?", askedAt: "2026-01-01T00:00:00.000Z" },
    { question: "How do I know whether I trust myself?", askedAt: "2026-01-05T00:00:00.000Z" },
    { question: "But what does trusting myself really mean?", askedAt: "2026-01-09T00:00:00.000Z" },
  ];

  it("recognizes rewordings of one unresolved question", () => {
    const verdict = detectRumination("How can I be sure I have learned to trust myself?", history);
    expect(verdict.looping).toBe(true);
    expect(verdict.priorAskCount).toBeGreaterThanOrEqual(2);
    expect(verdict.closest).toBeDefined();
  });

  it("does not treat a genuinely different question as a loop", () => {
    const verdict = detectRumination("Which albums did I keep coming back to in 2025?", history);
    expect(verdict.looping).toBe(false);
  });

  it("scores near-identical questions as similar", () => {
    expect(questionSimilarity("do I trust myself", "how do I know if I trust myself")).toBeGreaterThan(0.7);
    expect(questionSimilarity("do I trust myself", "what films influenced my work")).toBeLessThan(0.3);
  });

  it("offers choices rather than deciding", () => {
    expect(RUMINATION_OPTIONS).toEqual(
      expect.arrayContaining([expect.stringContaining("leave the question unresolved")])
    );
    expect(RUMINATION_OPTIONS).toEqual(expect.arrayContaining([expect.stringContaining("stop analysing")]));
  });
});

function entry(
  unitId: string,
  conversationId: string,
  date: string | undefined,
  options: Partial<EvidenceEntry> = {}
): EvidenceEntry {
  return {
    unitId,
    conversationId,
    date,
    line: renderEvidenceLine({ unitId, conversationId, date, text: "something", ...options }),
    ...options,
  };
}

describe("evidenceIndependence - repetition is not support", () => {
  it("counts one week of intense reflection as one period, not ten sources", () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      entry(`u${index}`, `conv-${index}`, `2026-03-0${(index % 3) + 1}`)
    );
    const stats = evidenceIndependence(entries);

    expect(stats.mentions).toBe(10);
    expect(stats.conversations).toBe(10);
    expect(stats.episodes).toBe(1);
  });

  it("separates reflection that returns months later", () => {
    const stats = evidenceIndependence([
      entry("a", "conv-1", "2024-01-01"),
      entry("b", "conv-2", "2024-01-03"),
      entry("c", "conv-3", "2025-06-01"),
      entry("d", "conv-4", "2026-02-02"),
    ]);
    expect(stats.episodes).toBe(3);
  });

  it("does not count previous AI interpretations as grounded evidence", () => {
    const stats = evidenceIndependence([
      entry("a", "conv-1", "2025-01-01", { origin: "user-originated" }),
      entry("b", "conv-2", "2025-06-01", { origin: "assistant-originated", evidenceType: "assistant-interpretation" }),
    ]);

    expect(stats.userGrounded).toBe(1);
    expect(stats.assistantOriginated).toBe(1);
  });

  it("counts what was done separately from what was said", () => {
    const stats = evidenceIndependence([
      entry("a", "conv-1", "2025-01-01", { evidenceType: "direct-user-statement" }),
      entry("b", "conv-2", "2025-08-01", { evidenceType: "reported-behavior" }),
      entry("c", "conv-3", "2025-09-01", { evidenceType: "event" }),
    ]);
    expect(stats.behavioral).toBe(2);
  });

  it("says out loud that frequency is not importance", () => {
    const description = describeIndependence(evidenceIndependence([entry("a", "conv-1", "2025-01-01")]));
    expect(description).toContain("Frequency reflects how often this was written about");
  });
});

describe("evidence lines carry their epistemic status", () => {
  it("marks previous AI interpretations in the text itself", () => {
    const line = renderEvidenceLine({
      unitId: "u1",
      conversationId: "c1",
      text: "you may be avoidant",
      origin: "assistant-originated",
      evidenceType: "assistant-interpretation",
    });
    expect(line).toContain("previous AI interpretation - ");
    expect(line).toContain("src:assistant-originated");
  });

  it("marks something done as something done", () => {
    const line = renderEvidenceLine({
      unitId: "u2",
      conversationId: "c1",
      text: "travelled alone for three weeks",
      evidenceType: "reported-behavior",
    });
    expect(line).toContain("something done - ");
  });
});
