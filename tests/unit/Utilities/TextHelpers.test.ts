import {
  unfinishedCodeBlock,
  extractRoleAndMessage,
  removeCommentsFromMessages,
  isTitleTimestampFormat,
  getHeadingPrefix,
  parseSettingsFrontmatter,
  escapeRegExp,
  splitMessages,
  removeYAMLFrontMatter,
} from "../../../src/Utilities/TextHelpers";
import { ROLE_IDENTIFIER, HORIZONTAL_LINE_MD } from "../../../src/Constants";

describe("TextHelpers", () => {
  describe("unfinishedCodeBlock", () => {
    it("should return false for no code blocks", () => {
      expect(unfinishedCodeBlock("This is plain text")).toBe(false);
    });

    it("should return false for closed code blocks", () => {
      expect(unfinishedCodeBlock("```\ncode\n```")).toBe(false);
    });

    it("should return true for unclosed code blocks", () => {
      // Mock console.log to avoid output during tests
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      expect(unfinishedCodeBlock("```\ncode without closing")).toBe(true);
      consoleSpy.mockRestore();
    });

    it("should return false for multiple closed code blocks", () => {
      expect(unfinishedCodeBlock("```\ncode1\n```\n```\ncode2\n```")).toBe(false);
    });

    it("should return true for odd number of backticks", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      expect(unfinishedCodeBlock("```\ncode1\n```\n```\nunclosed")).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe("extractRoleAndMessage", () => {
    it("should default to user role when no role identifier", () => {
      const result = extractRoleAndMessage("Hello world");
      expect(result.role).toBe("user");
      expect(result.content).toBe("Hello world");
    });

    it("should extract user role correctly", () => {
      const result = extractRoleAndMessage(`${ROLE_IDENTIFIER}user\nHello from user`);
      expect(result.role).toBe("user");
      expect(result.content).toBe("Hello from user");
    });

    it("should extract assistant role correctly", () => {
      const result = extractRoleAndMessage(`${ROLE_IDENTIFIER}assistant\nHello from assistant`);
      expect(result.role).toBe("assistant");
      expect(result.content).toBe("Hello from assistant");
    });

    it("should handle role with extra whitespace", () => {
      const result = extractRoleAndMessage(`${ROLE_IDENTIFIER}  user  \nMessage content`);
      expect(result.role).toBe("user");
      expect(result.content).toBe("Message content");
    });

    it("should handle multiline content", () => {
      const result = extractRoleAndMessage(`${ROLE_IDENTIFIER}user\nLine 1\nLine 2\nLine 3`);
      expect(result.role).toBe("user");
      expect(result.content).toBe("Line 1\nLine 2\nLine 3");
    });
  });

  describe("removeCommentsFromMessages", () => {
    it("should return unchanged text when no comments", () => {
      const text = "This is regular text";
      expect(removeCommentsFromMessages(text)).toBe(text);
    });

    it("should remove single comment block", () => {
      const text = "Before\n=begin-chatgpt-md-comment\nComment content\n=end-chatgpt-md-comment\nAfter";
      expect(removeCommentsFromMessages(text)).toBe("Before\n\nAfter");
    });

    it("should remove multiple comment blocks", () => {
      const text =
        "Start\n=begin-chatgpt-md-comment\nComment 1\n=end-chatgpt-md-comment\nMiddle\n=begin-chatgpt-md-comment\nComment 2\n=end-chatgpt-md-comment\nEnd";
      expect(removeCommentsFromMessages(text)).toBe("Start\n\nMiddle\n\nEnd");
    });
  });

  describe("isTitleTimestampFormat", () => {
    it("should return true for matching timestamp format", () => {
      expect(isTitleTimestampFormat("20231225120000", "YYYYMMDDhhmmss")).toBe(true);
    });

    it("should return false for non-matching format", () => {
      expect(isTitleTimestampFormat("Not a timestamp", "YYYYMMDDhhmmss")).toBe(false);
    });

    it("should return false for wrong length", () => {
      expect(isTitleTimestampFormat("202312", "YYYYMMDDhhmmss")).toBe(false);
    });

    it("should handle empty title", () => {
      expect(isTitleTimestampFormat("", "YYYY")).toBe(false);
    });

    it("should handle different date formats", () => {
      expect(isTitleTimestampFormat("2023-12-25", "YYYY-MM-DD")).toBe(true);
      expect(isTitleTimestampFormat("12/25/2023", "MM/DD/YYYY")).toBe(true);
    });
  });

  describe("getHeadingPrefix", () => {
    it("should return empty string for level 0", () => {
      expect(getHeadingPrefix(0)).toBe("");
    });

    it("should return correct number of hashes", () => {
      expect(getHeadingPrefix(1)).toBe("# ");
      expect(getHeadingPrefix(2)).toBe("## ");
      expect(getHeadingPrefix(3)).toBe("### ");
    });

    it("should cap at maximum heading level", () => {
      expect(getHeadingPrefix(10)).toBe("###### "); // Assuming MAX_HEADING_LEVEL is 6
    });
  });

  describe("parseSettingsFrontmatter", () => {
    it("should parse simple key-value pairs", () => {
      const yaml = `---
key1: value1
key2: value2
---`;
      const result = parseSettingsFrontmatter(yaml);
      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
    });

    it("should parse boolean values", () => {
      const yaml = `---
enabled: true
disabled: false
---`;
      const result = parseSettingsFrontmatter(yaml);
      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
    });

    it("should parse numeric values", () => {
      const yaml = `---
temperature: 0.7
max_tokens: 1000
---`;
      const result = parseSettingsFrontmatter(yaml);
      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(1000);
    });

    it("should parse inline arrays", () => {
      const yaml = `---
commands: [cmd1, cmd2, cmd3]
---`;
      const result = parseSettingsFrontmatter(yaml);
      expect(result.commands).toEqual(["cmd1", "cmd2", "cmd3"]);
    });

    it("should parse multi-line arrays", () => {
      const yaml = `---
system_commands:
  - First command
  - Second command
  - Third command
---`;
      const result = parseSettingsFrontmatter(yaml);
      expect(result.system_commands).toEqual(["First command", "Second command", "Third command"]);
    });

    it("should handle null values", () => {
      const yaml = `---
value: null
---`;
      const result = parseSettingsFrontmatter(yaml);
      expect(result.value).toBe(null);
    });
  });

  describe("escapeRegExp", () => {
    it("should escape special regex characters", () => {
      expect(escapeRegExp(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
    });

    it("should leave normal characters unchanged", () => {
      expect(escapeRegExp("Hello World 123")).toBe("Hello World 123");
    });
  });

  describe("splitMessages", () => {
    it("should split messages by horizontal line", () => {
      const messages = splitMessages(`Message 1${HORIZONTAL_LINE_MD}Message 2${HORIZONTAL_LINE_MD}Message 3`);
      expect(messages).toHaveLength(3);
      expect(messages[0]).toBe("Message 1");
      expect(messages[1]).toBe("Message 2");
      expect(messages[2]).toBe("Message 3");
    });

    it("should handle undefined input", () => {
      expect(splitMessages(undefined)).toEqual([]);
    });

    it("should handle single message", () => {
      expect(splitMessages("Single message")).toEqual(["Single message"]);
    });
  });

  describe("removeYAMLFrontMatter", () => {
    it("should remove YAML frontmatter", () => {
      const note = `---
title: Test
---

Content here`;
      expect(removeYAMLFrontMatter(note)).toBe("Content here");
    });

    it("should handle undefined input", () => {
      expect(removeYAMLFrontMatter(undefined)).toBe(undefined);
    });

    it("should handle content without frontmatter", () => {
      const note = "Just regular content";
      expect(removeYAMLFrontMatter(note)).toBe("Just regular content");
    });
  });
});
