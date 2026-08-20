import { NormalizedConversation } from "src/Models/Knowledge/ChatGPTExport";
import { ConversationNormalizer } from "./ConversationNormalizer";
import { parseArchivedConversation } from "./Sources/ArchiveSourceAdapter";

const CONVERSATION: NormalizedConversation = {
  conversationId: "conv-1",
  title: "Talking about control",
  createdAt: 1735689600,
  updatedAt: 1735689900,
  sourceKind: "official-export",
  messages: [
    { id: "m1", role: "user", content: "I always need to control everything.", createdAt: 1735689600 },
    { id: "m2", role: "assistant", content: "That sounds tiring.", createdAt: 1735689700 },
    { id: "m3", role: "user", content: "It is.\n\nEspecially at night.", createdAt: 1735689800 },
  ],
};

describe("ConversationNormalizer", () => {
  const normalizer = new ConversationNormalizer();

  it("builds a source document with provenance frontmatter", () => {
    const document = normalizer.build(CONVERSATION, {
      archiveFolder: "90 ChatGPT Sources",
      importedAt: "2026-08-20T10:00:00.000Z",
      processingVersion: 1,
    });

    expect(document.path).toMatch(/^90 ChatGPT Sources\/2025\/2025-01-01 Talking about control \([0-9a-f]{8}\)\.md$/);
    expect(document.content).toContain("type: chatgpt-source");
    expect(document.content).toContain('conversation_id: "conv-1"');
    expect(document.content).toContain("processed: false");
    expect(document.content).toContain(`content_hash: ${document.contentHash}`);
    expect(document.content).toContain("message_count: 3");
    expect(document.content).toContain("## User");
    expect(document.content).toContain("## Assistant");
    expect(document.content).toContain("Especially at night.");
  });

  it("files the archive by year and keeps ids stable", () => {
    const first = normalizer.archivePath(CONVERSATION, "90 ChatGPT Sources");
    const second = normalizer.archivePath({ ...CONVERSATION, title: "Talking about control" }, "90 ChatGPT Sources");

    expect(first).toBe(second);
    expect(first.startsWith("90 ChatGPT Sources/2025/2025-01-01 Talking about control (")).toBe(true);
  });

  it("puts undated conversations in their own folder rather than guessing", () => {
    const path = normalizer.archivePath({ ...CONVERSATION, createdAt: undefined }, "sources");
    expect(path.startsWith("sources/undated/")).toBe(true);
  });

  it("hashes content, not metadata", () => {
    const hash = normalizer.contentHash(CONVERSATION);
    expect(normalizer.contentHash({ ...CONVERSATION, updatedAt: 999 })).toBe(hash);
    expect(
      normalizer.contentHash({
        ...CONVERSATION,
        messages: [...CONVERSATION.messages, { id: "m4", role: "user", content: "More." }],
      })
    ).not.toBe(hash);
  });

  it("renders an analysis transcript with message ids and without system noise", () => {
    const transcript = normalizer.renderForAnalysis([
      ...CONVERSATION.messages,
      { id: "sys", role: "system", content: "hidden" },
    ]);

    expect(transcript).toContain("[m1] USER:");
    expect(transcript).toContain("[m2] ASSISTANT:");
    expect(transcript).not.toContain("hidden");
  });

  it("round-trips through the archive so reprocessing needs no export", () => {
    const document = normalizer.build(CONVERSATION, {
      archiveFolder: "90 ChatGPT Sources",
      importedAt: "2026-08-20T10:00:00.000Z",
      processingVersion: 1,
    });

    const restored = parseArchivedConversation(document.content, "source-archive", document.path)!;

    expect(restored.conversationId).toBe("conv-1");
    expect(restored.title).toBe("Talking about control");
    expect(restored.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(restored.messages[0].id).toBe("m1");
    expect(restored.messages[2].content).toBe("It is.\n\nEspecially at night.");
    expect(normalizer.contentHash(restored)).toBe(document.contentHash);
  });

  it("ignores a note that is not an archived conversation", () => {
    expect(parseArchivedConversation("# Just a note\n", "source-archive", "x.md")).toBeNull();
  });
});
