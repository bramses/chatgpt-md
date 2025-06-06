import { AddDividerCommand, AddDividerDependencies } from "../../../src/commands/AddDividerCommand";
import { ICommandContext } from "../../../src/commands/interfaces/ICommand";
import { MockEditor } from "../../helpers/MockEditor";
import { ROLE_USER } from "../../../src/Constants";

describe("AddDividerCommand", () => {
  let command: AddDividerCommand;
  let mockDeps: AddDividerDependencies;
  let mockEditor: MockEditor;
  let context: ICommandContext;

  beforeEach(() => {
    mockDeps = {
      getHeadingLevel: jest.fn().mockReturnValue(3),
    };

    command = new AddDividerCommand(mockDeps);
    mockEditor = new MockEditor("Initial content");

    context = {
      editor: mockEditor,
      app: {} as any,
    };
  });

  describe("properties", () => {
    it("should have correct id", () => {
      expect(command.id).toBe("add-hr");
    });

    it("should have correct name", () => {
      expect(command.name).toBe("Add divider");
    });

    it("should have correct icon", () => {
      expect(command.icon).toBe("minus");
    });
  });

  describe("execute", () => {
    it("should throw error when no editor is provided", async () => {
      context.editor = undefined;

      await expect(command.execute(context)).rejects.toThrow("Add divider command requires an editor");
    });

    it("should insert divider with correct heading level", async () => {
      await command.execute(context);

      const content = mockEditor.getValue();
      expect(content).toContain('<hr class="__chatgpt_plugin">');
      expect(content).toContain(`### role::${ROLE_USER}`);
    });

    it("should use heading level from dependencies", async () => {
      mockDeps.getHeadingLevel = jest.fn().mockReturnValue(2);

      await command.execute(context);

      const content = mockEditor.getValue();
      expect(content).toContain(`## role::${ROLE_USER}`);
      expect(mockDeps.getHeadingLevel).toHaveBeenCalled();
    });

    it("should insert divider at cursor position", async () => {
      mockEditor.setValue("Line 1\nLine 2\nLine 3");
      mockEditor.setCursor({ line: 1, ch: 6 }); // End of "Line 2"

      await command.execute(context);

      const content = mockEditor.getValue();

      // Check that the original content is preserved
      expect(content).toContain("Line 1");
      expect(content).toContain("Line 2");
      expect(content).toContain("Line 3");

      // Check that divider was inserted
      expect(content).toContain('<hr class="__chatgpt_plugin">');
      expect(content).toContain("### role::user");
    });

    it("should move cursor to end of inserted content", async () => {
      const initialCursor = { line: 0, ch: 0 };
      mockEditor.setCursor(initialCursor);

      await command.execute(context);

      const newCursor = mockEditor.getCursor();
      expect(newCursor.line).toBe(5); // Initial line + 5 lines of inserted content
      expect(newCursor.ch).toBe(0);
    });

    it("should format divider correctly", async () => {
      await command.execute(context);

      const content = mockEditor.getValue();
      const expectedDivider = '\n\n<hr class="__chatgpt_plugin">\n\n### role::user\n\n';

      expect(content).toContain(expectedDivider);
    });
  });
});
