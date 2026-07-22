/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect } from "@jest/globals";
import { VaultSearchService } from "./VaultSearchService";
import { TFile } from "obsidian";

/** Create a mock TFile for testing */
function createMockFile(path: string): TFile {
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  const nameParts = filename.split(".");
  const extension = nameParts.length > 1 ? nameParts.pop()! : "";
  const basename = nameParts.join(".");
  return { path, basename, name: filename, extension, stat: { ctime: 0, mtime: 0, size: 0 } } as unknown as TFile;
}

/** Create a minimal App mock for VaultSearchService tests */
function createMockApp(files: TFile[], fileContents: Record<string, string> = {}): any {
  return {
    vault: {
      getMarkdownFiles: jest.fn(() => files),
      read: jest.fn((file: TFile) => Promise.resolve(fileContents[file.path] ?? "")),
    },
    workspace: {
      getActiveFile: jest.fn(() => null),
    },
  };
}

const noContext: any = { abortSignal: undefined };

describe("VaultSearchService.searchVault", () => {
  describe("basename matching", () => {
    it("returns files whose basename contains the query word", async () => {
      const files = [createMockFile("notes/project-plan.md"), createMockFile("notes/grocery.md")];
      const app = createMockApp(files);
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "project" }, noContext);

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("notes/project-plan.md");
    });
  });

  describe("path/folder matching", () => {
    it("returns files whose folder path contains the query word", async () => {
      const files = [
        createMockFile("LectureNotes/Lecture1.md"),
        createMockFile("LectureNotes/Lecture2.md"),
        createMockFile("OtherFolder/SomeNote.md"),
      ];
      const app = createMockApp(files);
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "LectureNotes" }, noContext);

      expect(results).toHaveLength(2);
      const paths = results.map((r) => r.path);
      expect(paths).toContain("LectureNotes/Lecture1.md");
      expect(paths).toContain("LectureNotes/Lecture2.md");
    });

    it("matches folder names case-insensitively", async () => {
      const files = [createMockFile("LectureNotes/Lecture1.md"), createMockFile("other/note.md")];
      const app = createMockApp(files);
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "lecturenotes" }, noContext);

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("LectureNotes/Lecture1.md");
    });

    it("matches nested folder paths", async () => {
      const files = [
        createMockFile("School/2024/LectureNotes/Lecture1.md"),
        createMockFile("School/2024/Assignments/HW1.md"),
      ];
      const app = createMockApp(files);
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "LectureNotes" }, noContext);

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("School/2024/LectureNotes/Lecture1.md");
    });
  });

  describe("content matching fallback", () => {
    it("returns files whose content contains the query word when path and basename do not match", async () => {
      const files = [createMockFile("notes/random.md"), createMockFile("notes/other.md")];
      const app = createMockApp(files, {
        "notes/random.md": "This note mentions the keyword somewhere.",
        "notes/other.md": "Nothing relevant here.",
      });
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "keyword" }, noContext);

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("notes/random.md");
    });

    it("does not read file content when path or basename already matches", async () => {
      const files = [createMockFile("LectureNotes/Lecture1.md")];
      const app = createMockApp(files, {});
      const service = new VaultSearchService(app, {} as any);

      await service.searchVault({ query: "LectureNotes" }, noContext);

      // vault.read should not have been called because the path matched directly
      expect(app.vault.read).not.toHaveBeenCalled();
    });
  });

  describe("multi-word OR logic", () => {
    it("returns files matching any query word (OR logic)", async () => {
      const files = [
        createMockFile("LectureNotes/Lecture1.md"),
        createMockFile("Projects/plan.md"),
        createMockFile("personal/diary.md"),
      ];
      const app = createMockApp(files);
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "LectureNotes plan" }, noContext);

      expect(results).toHaveLength(2);
      const paths = results.map((r) => r.path);
      expect(paths).toContain("LectureNotes/Lecture1.md");
      expect(paths).toContain("Projects/plan.md");
    });
  });

  describe("result limits", () => {
    it("respects the limit parameter", async () => {
      const files = Array.from({ length: 10 }, (_, i) => createMockFile(`LectureNotes/Lecture${i}.md`));
      const app = createMockApp(files);
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "LectureNotes", limit: 3 }, noContext);

      expect(results).toHaveLength(3);
    });
  });

  describe("current file exclusion", () => {
    it("excludes the currently active file from results", async () => {
      const files = [createMockFile("LectureNotes/Lecture1.md"), createMockFile("LectureNotes/Lecture2.md")];
      const app = createMockApp(files);
      app.workspace.getActiveFile.mockReturnValue({ path: "LectureNotes/Lecture1.md" });
      const service = new VaultSearchService(app, {} as any);

      const results = await service.searchVault({ query: "LectureNotes" }, noContext);

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("LectureNotes/Lecture2.md");
    });
  });
});
