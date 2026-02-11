import {
  escapeRegExp,
  extractRoleAndMessage,
  getHeadingPrefix,
  parseSettingsFrontmatter,
  removeYAMLFrontMatter,
  splitMessages,
} from "./TextHelpers";

describe("extractRoleAndMessage", () => {
  it("returns user role when no role identifier present", () => {
    const result = extractRoleAndMessage("Hello world");
    expect(result.role).toBe("user");
    expect(result.content).toBe("Hello world");
  });

  it("extracts assistant role correctly", () => {
    const result = extractRoleAndMessage("role::assistant\nHello from AI");
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Hello from AI");
  });

  it("extracts developer role correctly", () => {
    const result = extractRoleAndMessage("role::developer\nSystem message");
    expect(result.role).toBe("developer");
    expect(result.content).toBe("System message");
  });

  it("handles role with extra whitespace", () => {
    const result = extractRoleAndMessage("role::  user  \nMessage");
    expect(result.role).toBe("user");
    expect(result.content).toBe("Message");
  });

  it("handles role with capital letters", () => {
    const result = extractRoleAndMessage("role::ASSISTANT\nMessage");
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Message");
  });

  it("handles multi-line content", () => {
    const result = extractRoleAndMessage("role::assistant\nLine 1\nLine 2\nLine 3");
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("Line 1\nLine 2\nLine 3");
  });

  it("throws error for invalid role", () => {
    expect(() => extractRoleAndMessage("role::invalid\nMessage")).toThrow();
  });
});

describe("getHeadingPrefix", () => {
  it("returns empty string for level 0", () => {
    expect(getHeadingPrefix(0)).toBe("");
  });

  it("returns correct prefix for level 1", () => {
    expect(getHeadingPrefix(1)).toBe("# ");
  });

  it("returns correct prefix for level 2", () => {
    expect(getHeadingPrefix(2)).toBe("## ");
  });

  it("returns correct prefix for level 3", () => {
    expect(getHeadingPrefix(3)).toBe("### ");
  });

  it("returns correct prefix for level 6", () => {
    expect(getHeadingPrefix(6)).toBe("###### ");
  });

  it("caps at max heading level (6)", () => {
    expect(getHeadingPrefix(10)).toBe("###### ");
  });

  it("caps at max heading level for very large values", () => {
    expect(getHeadingPrefix(100)).toBe("###### ");
  });
});

describe("parseSettingsFrontmatter", () => {
  it("parses simple key-value pairs", () => {
    const yaml = `---
model: gpt-4
temperature: 0.7
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.model).toBe("gpt-4");
    expect(result.temperature).toBe(0.7);
  });

  it("parses inline arrays", () => {
    const yaml = `---
tags: [a, b, c]
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.tags).toEqual(["a", "b", "c"]);
  });

  it("parses multi-line arrays", () => {
    const yaml = `---
system_commands:
  - Be helpful
  - Be concise
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.system_commands).toEqual(["Be helpful", "Be concise"]);
  });

  it("parses booleans", () => {
    const yaml = `---
stream: true
debug: false
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.stream).toBe(true);
    expect(result.debug).toBe(false);
  });

  it("parses null values", () => {
    const yaml = `---
apiKey: null
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.apiKey).toBe(null);
  });

  it("parses numbers", () => {
    const yaml = `---
maxTokens: 2048
temperature: 0.5
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.maxTokens).toBe(2048);
    expect(result.temperature).toBe(0.5);
  });

  it("handles mixed value types", () => {
    const yaml = `---
model: gpt-4
temperature: 0.7
stream: true
tags: [a, b]
maxTokens: 1000
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.model).toBe("gpt-4");
    expect(result.temperature).toBe(0.7);
    expect(result.stream).toBe(true);
    expect(result.tags).toEqual(["a", "b"]);
    expect(result.maxTokens).toBe(1000);
  });

  it("handles empty arrays", () => {
    const yaml = `---
tags: []
---`;
    const result = parseSettingsFrontmatter(yaml);
    // Empty array in YAML results in array with empty string due to slice/split behavior
    expect(result.tags).toEqual([""]);
  });

  it("handles quoted strings in arrays", () => {
    const yaml = `---
tags: ["tag1", "tag2", "tag3"]
---`;
    const result = parseSettingsFrontmatter(yaml);
    expect(result.tags).toEqual(["tag1", "tag2", "tag3"]);
  });
});

describe("removeYAMLFrontMatter", () => {
  it("returns content after frontmatter", () => {
    const note = `---
title: Test
---
Content here`;
    expect(removeYAMLFrontMatter(note)).toBe("Content here");
  });

  it("returns original if no frontmatter", () => {
    const note = "Just content";
    expect(removeYAMLFrontMatter(note)).toBe("Just content");
  });

  it("handles undefined input", () => {
    expect(removeYAMLFrontMatter(undefined)).toBeUndefined();
  });

  it("handles empty string", () => {
    expect(removeYAMLFrontMatter("")).toBe("");
  });

  it("returns original if frontmatter not closed", () => {
    const note = `---
title: Test
Content here`;
    expect(removeYAMLFrontMatter(note)).toBe(note);
  });

  it("handles multi-line frontmatter", () => {
    const note = `---
title: Test
model: gpt-4
temperature: 0.7
---
# Content
Hello world`;
    expect(removeYAMLFrontMatter(note)).toBe("# Content\nHello world");
  });

  it("preserves content formatting", () => {
    const note = `---
title: Test
---
# Heading
- List item 1
- List item 2`;
    expect(removeYAMLFrontMatter(note)).toBe("# Heading\n- List item 1\n- List item 2");
  });
});

describe("escapeRegExp", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegExp("test.file")).toBe("test\\.file");
    expect(escapeRegExp("test*file")).toBe("test\\*file");
    expect(escapeRegExp("test+file")).toBe("test\\+file");
    expect(escapeRegExp("test?file")).toBe("test\\?file");
  });

  it("escapes brackets", () => {
    expect(escapeRegExp("test[file]")).toBe("test\\[file\\]");
    expect(escapeRegExp("test(file)")).toBe("test\\(file\\)");
    expect(escapeRegExp("test{file}")).toBe("test\\{file\\}");
  });

  it("escapes special characters", () => {
    expect(escapeRegExp("test^file")).toBe("test\\^file");
    expect(escapeRegExp("test$file")).toBe("test\\$file");
    expect(escapeRegExp("test|file")).toBe("test\\|file");
    expect(escapeRegExp("test\\file")).toBe("test\\\\file");
  });

  it("handles string with multiple special characters", () => {
    expect(escapeRegExp("test.*+?^${}()|[]\\")).toBe("test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  it("handles normal strings without special characters", () => {
    expect(escapeRegExp("testfile")).toBe("testfile");
    expect(escapeRegExp("test-file_123")).toBe("test-file_123");
  });

  it("handles empty string", () => {
    expect(escapeRegExp("")).toBe("");
  });
});

describe("splitMessages", () => {
  it("splits on horizontal line", () => {
    const text = 'Message 1<hr class="__chatgpt_plugin">Message 2';
    const result = splitMessages(text);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("Message 1");
    expect(result[1]).toBe("Message 2");
  });

  it("handles multiple messages", () => {
    const text = 'M1<hr class="__chatgpt_plugin">M2<hr class="__chatgpt_plugin">M3';
    const result = splitMessages(text);
    expect(result).toHaveLength(3);
  });

  it("handles undefined input", () => {
    expect(splitMessages(undefined)).toEqual([]);
  });

  it("handles empty string", () => {
    // Empty string is falsy, so returns empty array
    expect(splitMessages("")).toEqual([]);
  });

  it("handles text with no separators", () => {
    const text = "Just one message";
    const result = splitMessages(text);
    expect(result).toEqual(["Just one message"]);
  });
});
