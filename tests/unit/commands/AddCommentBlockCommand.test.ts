import { AddCommentBlockCommand } from "../../../src/commands/AddCommentBlockCommand";
import { MockEditor } from "../../helpers/MockEditor";
import { ICommandContext } from "../../../src/commands/interfaces/ICommand";
import { ADD_COMMENT_BLOCK_COMMAND_ID, COMMENT_BLOCK_START, COMMENT_BLOCK_END, NEWLINE } from "../../../src/Constants";

describe("AddCommentBlockCommand", () => {
  let mockEditor: MockEditor;
  let command: AddCommentBlockCommand;
  let context: ICommandContext;

  beforeEach(() => {
    mockEditor = new MockEditor();
    command = new AddCommentBlockCommand(mockEditor);

    context = {
      editor: mockEditor,
      view: undefined,
      app: {} as any,
    };
  });

  describe("Command Properties", () => {
    it("should have correct id", () => {
      expect(command.id).toBe(ADD_COMMENT_BLOCK_COMMAND_ID);
    });

    it("should have correct name", () => {
      expect(command.name).toBe("Add comment block");
    });

    it("should have correct icon", () => {
      expect(command.icon).toBe("comment");
    });
  });

  describe("Command Execution", () => {
    it("should add comment block at cursor position", async () => {
      const initialContent = "Some text";
      mockEditor.setValue(initialContent);
      mockEditor.setCursor({ line: 0, ch: 9 }); // End of "Some text"

      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedCommentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;

      expect(content).toContain(COMMENT_BLOCK_START);
      expect(content).toContain(COMMENT_BLOCK_END);
      expect(content).toBe(`Some text${expectedCommentBlock}`);
    });

    it("should position cursor inside comment block", async () => {
      mockEditor.setValue("Initial content");
      mockEditor.setCursor({ line: 0, ch: 0 }); // Start of content

      await command.execute(context);

      const newCursor = mockEditor.getCursor();
      expect(newCursor.line).toBe(1); // One line down from initial position
      expect(newCursor.ch).toBe(0); // Same character position
    });

    it("should insert comment block in middle of content", async () => {
      const initialContent = "Line 1\nLine 2\nLine 3";
      mockEditor.setValue(initialContent);
      mockEditor.setCursor({ line: 1, ch: 3 }); // Middle of "Line 2"

      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedCommentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;

      expect(content).toContain("Lin" + expectedCommentBlock + "e 2");
      expect(content).toContain("Line 1");
      expect(content).toContain("Line 3");
    });

    it("should handle empty editor", async () => {
      mockEditor.setValue("");
      mockEditor.setCursor({ line: 0, ch: 0 });

      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedCommentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;

      expect(content).toBe(expectedCommentBlock);
    });

    it("should preserve cursor character position when adding comment", async () => {
      mockEditor.setValue("Test content");
      const initialCursor = { line: 0, ch: 5 }; // After "Test "
      mockEditor.setCursor(initialCursor);

      await command.execute(context);

      const newCursor = mockEditor.getCursor();
      expect(newCursor.line).toBe(initialCursor.line + 1);
      expect(newCursor.ch).toBe(initialCursor.ch);
    });

    it("should work at beginning of line", async () => {
      mockEditor.setValue("First line\nSecond line");
      mockEditor.setCursor({ line: 1, ch: 0 }); // Start of second line

      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedCommentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;

      expect(content).toContain(`First line\n${expectedCommentBlock}Second line`);
    });

    it("should work at end of line", async () => {
      mockEditor.setValue("First line\nSecond line");
      mockEditor.setCursor({ line: 0, ch: 10 }); // End of "First line"

      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedCommentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;

      expect(content).toContain(`First line${expectedCommentBlock}\nSecond line`);
    });

    it("should handle multi-line content correctly", async () => {
      const multiLineContent = `Line 1
Line 2
Line 3
Line 4`;
      mockEditor.setValue(multiLineContent);
      mockEditor.setCursor({ line: 2, ch: 6 }); // End of "Line 3"

      await command.execute(context);

      const content = mockEditor.getValue();
      expect(content).toContain("Line 1");
      expect(content).toContain("Line 2");
      expect(content).toContain("Line 4");
      expect(content).toContain(COMMENT_BLOCK_START);
      expect(content).toContain(COMMENT_BLOCK_END);

      // Check cursor positioning
      const newCursor = mockEditor.getCursor();
      expect(newCursor.line).toBe(3); // One line down from line 2
      expect(newCursor.ch).toBe(6); // Same character position
    });
  });

  describe("Error Handling", () => {
    it("should throw error when no editor is provided", async () => {
      const contextWithoutEditor: ICommandContext = {
        editor: undefined,
        view: undefined,
        app: {} as any,
      };

      await expect(command.execute(contextWithoutEditor)).rejects.toThrow(
        "Add comment block command requires an editor"
      );
    });
  });

  describe("Comment Block Format", () => {
    it("should use correct comment block markers", async () => {
      mockEditor.setValue("Test");
      mockEditor.setCursor({ line: 0, ch: 4 });

      await command.execute(context);

      const content = mockEditor.getValue();

      // Verify exact format
      expect(content).toContain(`=begin-chatgpt-md-comment${NEWLINE}`);
      expect(content).toContain("=end-chatgpt-md-comment");
    });

    it("should have proper newline structure", async () => {
      mockEditor.setValue("");
      mockEditor.setCursor({ line: 0, ch: 0 });

      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedFormat = `=begin-chatgpt-md-comment${NEWLINE}${NEWLINE}=end-chatgpt-md-comment`;

      expect(content).toBe(expectedFormat);
    });
  });
});
