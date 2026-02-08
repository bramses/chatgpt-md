import { findLinksInMessage, splitMessages, removeCommentBlocks } from "./MessageHelpers";

describe("findLinksInMessage", () => {
  it("finds wiki links", () => {
    const result = findLinksInMessage("See [[Note Title]] for more");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Note Title");
    expect(result[0].link).toBe("[[Note Title]]");
  });

  it("handles wiki links with aliases", () => {
    const result = findLinksInMessage("Check [[Note|Alias]]");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Note");
    expect(result[0].link).toBe("[[Note|Alias]]");
  });

  it("handles wiki links with complex aliases", () => {
    const result = findLinksInMessage("See [[path/to/note|Display Text]]");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("path/to/note");
  });

  it("finds markdown links", () => {
    const result = findLinksInMessage("See [Link Text](path/to/note)");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("path/to/note");
    expect(result[0].link).toBe("[Link Text](path/to/note)");
  });

  it("excludes http links", () => {
    const result = findLinksInMessage("Visit [Google](https://google.com)");
    expect(result).toHaveLength(0);
  });

  it("excludes https links", () => {
    const result = findLinksInMessage("Visit [Site](http://example.com)");
    expect(result).toHaveLength(0);
  });

  it("deduplicates links", () => {
    const result = findLinksInMessage("[[Note]] and [[Note]] again");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Note");
  });

  it("finds multiple different links", () => {
    const result = findLinksInMessage("See [[Note1]] and [[Note2]]");
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Note1");
    expect(result[1].title).toBe("Note2");
  });

  it("finds mixed wiki and markdown links", () => {
    const result = findLinksInMessage("See [[Wiki Link]] and [Markdown](path/to/file)");
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Wiki Link");
    expect(result[1].title).toBe("path/to/file");
  });

  it("handles empty string", () => {
    const result = findLinksInMessage("");
    expect(result).toEqual([]);
  });

  it("handles text with no links", () => {
    const result = findLinksInMessage("Just plain text");
    expect(result).toEqual([]);
  });

  it("handles nested brackets correctly", () => {
    // The regex doesn't support nested brackets - this is expected behavior
    const result = findLinksInMessage("[[Note [with] brackets]]");
    expect(result).toHaveLength(0);
  });

  it("deduplicates wiki and markdown links to same file", () => {
    const result = findLinksInMessage("[[Note]] and [Link](Note)");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Note");
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

  it("handles multiple separators", () => {
    const text = 'M1<hr class="__chatgpt_plugin">M2<hr class="__chatgpt_plugin">M3';
    const result = splitMessages(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("M1");
    expect(result[1]).toBe("M2");
    expect(result[2]).toBe("M3");
  });

  it("handles undefined input", () => {
    expect(splitMessages(undefined)).toEqual([]);
  });

  it("handles empty string", () => {
    const result = splitMessages("");
    // Empty string is falsy, so returns empty array
    expect(result).toEqual([]);
  });

  it("handles text without separators", () => {
    const text = "Single message";
    const result = splitMessages(text);
    expect(result).toEqual(["Single message"]);
  });

  it("preserves empty messages between separators", () => {
    const text = 'M1<hr class="__chatgpt_plugin"><hr class="__chatgpt_plugin">M3';
    const result = splitMessages(text);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("M1");
    expect(result[1]).toBe("");
    expect(result[2]).toBe("M3");
  });
});

describe("removeCommentBlocks", () => {
  it("removes comment block", () => {
    const message = "Before =begin-chatgpt-md-comment\nHidden\n=end-chatgpt-md-comment After";
    expect(removeCommentBlocks(message)).toBe("Before  After");
  });

  it("returns original if no comments", () => {
    const message = "Just text";
    expect(removeCommentBlocks(message)).toBe("Just text");
  });

  it("returns original if comment not closed", () => {
    const message = "Text =begin-chatgpt-md-comment\nUnclosed";
    expect(removeCommentBlocks(message)).toBe(message);
  });

  it("returns original if only closing tag", () => {
    const message = "Text =end-chatgpt-md-comment";
    expect(removeCommentBlocks(message)).toBe(message);
  });

  it("handles empty string", () => {
    expect(removeCommentBlocks("")).toBe("");
  });

  it("handles comment at start of message", () => {
    const message = "=begin-chatgpt-md-comment\nHidden\n=end-chatgpt-md-comment After";
    expect(removeCommentBlocks(message)).toBe(" After");
  });

  it("handles comment at end of message", () => {
    const message = "Before =begin-chatgpt-md-comment\nHidden\n=end-chatgpt-md-comment";
    expect(removeCommentBlocks(message)).toBe("Before ");
  });

  it("removes entire message if only comment", () => {
    const message = "=begin-chatgpt-md-comment\nHidden\n=end-chatgpt-md-comment";
    expect(removeCommentBlocks(message)).toBe("");
  });

  it("preserves text before and after comment", () => {
    const message = "Start =begin-chatgpt-md-comment\nHidden\n=end-chatgpt-md-comment End";
    const result = removeCommentBlocks(message);
    expect(result).toBe("Start  End");
  });
});
