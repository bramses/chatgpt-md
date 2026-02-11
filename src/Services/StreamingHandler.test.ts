/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { StreamingHandler } from "./StreamingHandler";

/** Minimal Editor mock that satisfies StreamingHandler + flushBufferedText */
function createMockEditor(): any {
  return {
    replaceRange: jest.fn(),
    replaceSelection: jest.fn(),
    setCursor: jest.fn(),
    posToOffset: jest.fn((pos: { line: number; ch: number }) => pos.line * 100 + pos.ch),
    offsetToPos: jest.fn((offset: number) => ({
      line: Math.floor(offset / 100),
      ch: offset % 100,
    })),
  };
}

describe("StreamingHandler", () => {
  let editor: any;
  let handler: StreamingHandler;

  beforeEach(() => {
    editor = createMockEditor();
    handler = new StreamingHandler(editor, { line: 0, ch: 0 });
  });

  describe("flush", () => {
    it("does nothing when buffer is empty", () => {
      handler.flush();

      expect(editor.replaceRange).not.toHaveBeenCalled();
      expect(handler.getBufferedText()).toBe("");
    });

    it("does not flush when buffer has no newline", () => {
      handler.appendText("partial text");

      handler.flush();

      expect(editor.replaceRange).not.toHaveBeenCalled();
      expect(handler.getBufferedText()).toBe("partial text");
    });

    it("flushes a single complete line", () => {
      handler.appendText("hello world\n");

      handler.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith("hello world\n", { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("");
    });

    it("flushes multiple complete lines and retains partial trailing line", () => {
      handler.appendText("line 1\nline 2\npartial");

      handler.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith("line 1\nline 2\n", { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("partial");
    });

    it("flushes all text when buffer ends with newline", () => {
      handler.appendText("line 1\nline 2\n");

      handler.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith("line 1\nline 2\n", { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("");
    });

    it("handles consecutive newlines correctly", () => {
      handler.appendText("line 1\n\n\npartial");

      handler.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith("line 1\n\n\n", { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("partial");
    });

    it("force flushes when buffer exceeds MAX_BUFFER_SIZE", () => {
      const largeText = "x".repeat(10001);
      handler.appendText(largeText);

      handler.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith(largeText, { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("");
    });

    it("uses line-boundary logic when buffer is under MAX_BUFFER_SIZE", () => {
      const text = "x".repeat(9990) + "\npartial";
      handler.appendText(text);

      handler.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith("x".repeat(9990) + "\n", { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("partial");
    });
  });

  describe("stopBuffering", () => {
    it("flushes remaining partial line on stop", () => {
      handler.appendText("no newline here");

      handler.stopBuffering();

      expect(editor.replaceRange).toHaveBeenCalledWith("no newline here", { line: 0, ch: 0 });
      expect(handler.getBufferedText()).toBe("");
    });

    it("flushes everything including partial line after prior flush", () => {
      handler.appendText("line 1\npartial");

      handler.flush();
      expect(editor.replaceRange).toHaveBeenCalledWith("line 1\n", { line: 0, ch: 0 });

      handler.stopBuffering();
      expect(editor.replaceRange).toHaveBeenCalledTimes(2);
      expect(handler.getBufferedText()).toBe("");
    });

    it("does nothing when buffer is already empty", () => {
      handler.stopBuffering();

      expect(editor.replaceRange).not.toHaveBeenCalled();
    });
  });

  describe("incremental streaming", () => {
    it("accumulates small chunks and flushes at line boundaries", () => {
      handler.appendText("| col1");
      handler.flush();
      expect(editor.replaceRange).not.toHaveBeenCalled();

      handler.appendText(" | col2 |\n");
      handler.flush();
      expect(editor.replaceRange).toHaveBeenCalledWith("| col1 | col2 |\n", { line: 0, ch: 0 });
    });

    it("handles code fence tokens arriving across multiple appends", () => {
      handler.appendText("text before\n");
      handler.flush();
      expect(editor.replaceRange).toHaveBeenCalledTimes(1);

      handler.appendText("```python\nimport os");
      handler.flush();
      expect(editor.replaceRange).toHaveBeenCalledTimes(2);
      expect(handler.getBufferedText()).toBe("import os");

      handler.appendText("\nprint('hello')\n```\n");
      handler.flush();
      expect(editor.replaceRange).toHaveBeenCalledTimes(3);
      expect(handler.getBufferedText()).toBe("");
    });
  });
});
