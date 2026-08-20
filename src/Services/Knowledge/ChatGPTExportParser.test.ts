import { ChatGPTExportParser, renderMessageContent } from "./ChatGPTExportParser";

/** Build a mapping-graph conversation the way the official export does. */
function mappingConversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Talking about control",
    create_time: 1700000000,
    update_time: 1700000600,
    conversation_id: "conv-1",
    current_node: "n3",
    mapping: {
      root: { id: "root", message: null, parent: null, children: ["n1"] },
      n1: {
        id: "n1",
        parent: "root",
        children: ["n2"],
        message: {
          id: "m1",
          author: { role: "user" },
          create_time: 1700000100,
          content: { content_type: "text", parts: ["I always need to control everything."] },
        },
      },
      n2: {
        id: "n2",
        parent: "n1",
        children: ["n3"],
        message: {
          id: "m2",
          author: { role: "assistant" },
          create_time: 1700000200,
          content: { content_type: "text", parts: ["That sounds tiring."] },
        },
      },
      n3: {
        id: "n3",
        parent: "n2",
        children: [],
        message: {
          id: "m3",
          author: { role: "user" },
          create_time: 1700000300,
          content: { content_type: "text", parts: ["It is."] },
        },
      },
    },
    ...overrides,
  };
}

describe("ChatGPTExportParser", () => {
  const parser = new ChatGPTExportParser();

  it("parses a normal conversation from the mapping graph", () => {
    const result = parser.parse(JSON.stringify([mappingConversation()]));

    expect(result.conversations).toHaveLength(1);
    const conversation = result.conversations[0];
    expect(conversation.conversationId).toBe("conv-1");
    expect(conversation.title).toBe("Talking about control");
    expect(conversation.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(conversation.messages[0].content).toBe("I always need to control everything.");
    expect(conversation.createdAt).toBe(1700000000);
  });

  it("derives a title when the export has none", () => {
    const result = parser.parse(JSON.stringify([mappingConversation({ title: null })]));
    expect(result.conversations[0].title).toBe("I always need to control everything.");
  });

  it("follows the active branch of a branched conversation", () => {
    const branched = mappingConversation({
      current_node: "n2b",
      mapping: {
        root: { id: "root", message: null, parent: null, children: ["n1"] },
        n1: {
          id: "n1",
          parent: "root",
          children: ["n2a", "n2b"],
          message: { id: "m1", author: { role: "user" }, content: { parts: ["Question"] } },
        },
        n2a: {
          id: "n2a",
          parent: "n1",
          children: [],
          message: { id: "m2a", author: { role: "assistant" }, content: { parts: ["Discarded answer"] } },
        },
        n2b: {
          id: "n2b",
          parent: "n1",
          children: [],
          message: { id: "m2b", author: { role: "assistant" }, content: { parts: ["Kept answer"] } },
        },
      },
    });

    const conversation = parser.parse(JSON.stringify([branched])).conversations[0];
    const texts = conversation.messages.map((message) => message.content);
    expect(texts).toEqual(["Question", "Kept answer"]);
  });

  it("keeps every message when the active branch is unknown", () => {
    const noCurrent = mappingConversation({ current_node: undefined });
    const conversation = parser.parse(JSON.stringify([noCurrent])).conversations[0];
    expect(conversation.messages).toHaveLength(3);
  });

  it("drops deleted and empty nodes without dropping the conversation", () => {
    const withDeleted = mappingConversation({
      current_node: "n3",
      mapping: {
        ...(mappingConversation().mapping as Record<string, unknown>),
        n2: { id: "n2", parent: "n1", children: ["n3"], message: null },
      },
    });
    const conversation = parser.parse(JSON.stringify([withDeleted])).conversations[0];
    expect(conversation.messages.map((message) => message.id)).toEqual(["m1", "m3"]);
  });

  it("keeps tool and system messages but hides invisible system messages", () => {
    const withRoles = mappingConversation({
      current_node: "n3",
      mapping: {
        root: { id: "root", message: null, parent: null, children: ["n1"] },
        n1: {
          id: "n1",
          parent: "root",
          children: ["n2"],
          message: {
            id: "sys",
            author: { role: "system" },
            content: { parts: ["hidden"] },
            metadata: { is_visually_hidden_from_conversation: true },
          },
        },
        n2: {
          id: "n2",
          parent: "n1",
          children: ["n3"],
          message: { id: "tool", author: { role: "tool" }, content: { parts: ["tool output"] } },
        },
        n3: {
          id: "n3",
          parent: "n2",
          children: [],
          message: { id: "u", author: { role: "user" }, content: { parts: ["hello"] } },
        },
      },
    });

    const conversation = parser.parse(JSON.stringify([withRoles])).conversations[0];
    expect(conversation.messages.map((message) => message.role)).toEqual(["tool", "user"]);
  });

  it("reports malformed entries instead of silently discarding them", () => {
    const result = parser.parse(JSON.stringify([mappingConversation(), { title: "broken" }, 42]));
    expect(result.conversations).toHaveLength(1);
    expect(result.totalEntries).toBe(3);
    expect(result.warnings).toHaveLength(2);
  });

  it("returns a warning instead of throwing on invalid JSON", () => {
    const result = parser.parse("{not json");
    expect(result.conversations).toHaveLength(0);
    expect(result.warnings[0].reason).toMatch(/Invalid JSON/);
  });

  it("accepts a wrapper object and a single conversation object", () => {
    expect(parser.parse(JSON.stringify({ conversations: [mappingConversation()] })).conversations).toHaveLength(1);
    expect(parser.parse(JSON.stringify(mappingConversation())).conversations).toHaveLength(1);
  });

  it("reads a flat messages array from non-official exports", () => {
    const flat = {
      id: "flat-1",
      title: "Flat",
      messages: [
        { id: "a", author: { role: "user" }, content: "hi" },
        { id: "b", author: { role: "assistant" }, content: { parts: ["hello"] } },
      ],
    };
    const conversation = parser.parse(JSON.stringify([flat])).conversations[0];
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0].content).toBe("hi");
  });

  it("handles a very large conversation without losing messages", () => {
    const mapping: Record<string, unknown> = { root: { id: "root", message: null, parent: null, children: ["m0"] } };
    for (let index = 0; index < 2000; index++) {
      mapping[`m${index}`] = {
        id: `m${index}`,
        parent: index === 0 ? "root" : `m${index - 1}`,
        children: index === 1999 ? [] : [`m${index + 1}`],
        message: {
          id: `msg-${index}`,
          author: { role: index % 2 === 0 ? "user" : "assistant" },
          create_time: 1700000000 + index,
          content: { parts: [`message ${index}`] },
        },
      };
    }
    const huge = mappingConversation({ mapping, current_node: "m1999" });
    const conversation = parser.parse(JSON.stringify([huge])).conversations[0];
    expect(conversation.messages).toHaveLength(2000);
    expect(conversation.messages[1999].content).toBe("message 1999");
  });

  it("generates a stable id when the export has none", () => {
    const entry = mappingConversation({ conversation_id: undefined, id: undefined });
    const first = parser.parse(JSON.stringify([entry])).conversations[0].conversationId;
    const second = parser.parse(JSON.stringify([entry])).conversations[0].conversationId;
    expect(first).toBe(second);
    expect(first).toMatch(/^derived-/);
  });
});

describe("renderMessageContent", () => {
  it("renders multimodal parts with placeholders", () => {
    const content = { content_type: "multimodal_text", parts: [{ content_type: "image_asset_pointer" }, "and text"] };
    expect(renderMessageContent(content)).toBe("[image]\n\nand text");
  });

  it("wraps code content in a fence", () => {
    expect(renderMessageContent({ content_type: "code", text: "print(1)" })).toBe("```\nprint(1)\n```");
  });

  it("renders custom instructions", () => {
    const content = {
      content_type: "user_editable_context",
      user_profile: "I am Leander",
      user_instructions: "Be direct",
    };
    expect(renderMessageContent(content)).toBe("I am Leander\n\nBe direct");
  });

  it("returns an empty string for unknown empty content", () => {
    expect(renderMessageContent({ content_type: "weird" })).toBe("");
    expect(renderMessageContent(undefined)).toBe("");
  });
});
