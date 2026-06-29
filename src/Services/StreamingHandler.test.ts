/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { MarkdownView } from "obsidian";
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

/**
 * Build an App mock whose single markdown leaf currently displays `editor`
 * for the file at `displayedPath`. Lets tests simulate the editor staying on
 * the original note or navigating away to a different one.
 */
function createMockApp(editor: any, displayedPath: string) {
  const view = new (MarkdownView as any)();
  view.editor = editor;
  view.file = { path: displayedPath };

  return {
    workspace: {
      getLeavesOfType: jest.fn(() => [{ view }]),
    },
    vault: {
      process: jest.fn((_file: any, fn: (data: string) => string) => Promise.resolve(fn("existing "))),
    },
  } as any;
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

  describe("note-switch redirection", () => {
    const targetFile = { path: "note-a.md" } as any;

    it("writes to the editor while it still shows the original note", () => {
      const app = createMockApp(editor, "note-a.md");
      const guarded = new StreamingHandler(editor, { line: 0, ch: 0 }, false, undefined, app, targetFile);

      guarded.appendText("hello world\n");
      guarded.flush();

      expect(editor.replaceRange).toHaveBeenCalledWith("hello world\n", { line: 0, ch: 0 });
      expect(app.vault.process).not.toHaveBeenCalled();
      expect(guarded.isRedirected()).toBe(false);
      expect(guarded.canWriteToEditor()).toBe(true);
    });

    it("redirects writes to the original file when the editor navigated away", async () => {
      // The editor now displays a different note than the one we streamed into.
      const app = createMockApp(editor, "note-b.md");
      const guarded = new StreamingHandler(editor, { line: 0, ch: 0 }, false, undefined, app, targetFile);

      guarded.appendText("hello world\n");
      guarded.flush();
      await guarded.flushPendingFileWrites();

      expect(editor.replaceRange).not.toHaveBeenCalled();
      expect(app.vault.process).toHaveBeenCalledWith(targetFile, expect.any(Function));
      expect(guarded.isRedirected()).toBe(true);
      expect(guarded.canWriteToEditor()).toBe(false);
    });

    it("stays redirected once the editor has navigated away (sticky)", async () => {
      const view = new (MarkdownView as any)();
      view.editor = editor;
      let displayedPath = "note-a.md";
      view.file = {
        get path() {
          return displayedPath;
        },
      };
      const app = {
        workspace: { getLeavesOfType: jest.fn(() => [{ view }]) },
        vault: { process: jest.fn((_f: any, fn: (d: string) => string) => Promise.resolve(fn(""))) },
      } as any;

      const guarded = new StreamingHandler(editor, { line: 0, ch: 0 }, false, undefined, app, targetFile);

      // First flush while still on the original note -> editor write.
      guarded.appendText("line 1\n");
      guarded.flush();
      expect(editor.replaceRange).toHaveBeenCalledTimes(1);

      // User navigates away; subsequent flush redirects to the file.
      displayedPath = "note-b.md";
      guarded.appendText("line 2\n");
      guarded.flush();
      await guarded.flushPendingFileWrites();
      expect(app.vault.process).toHaveBeenCalledTimes(1);

      // Even if the user navigates back, output stays pinned to the file.
      displayedPath = "note-a.md";
      guarded.appendText("line 3\n");
      guarded.flush();
      await guarded.flushPendingFileWrites();
      expect(editor.replaceRange).toHaveBeenCalledTimes(1);
      expect(app.vault.process).toHaveBeenCalledTimes(2);
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
