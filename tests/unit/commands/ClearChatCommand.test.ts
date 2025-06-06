import { ClearChatCommand } from "../../../src/commands/ClearChatCommand";
import { MockEditor } from "../../helpers/MockEditor";
import { MockNotificationService } from "../../helpers/MockNotificationService";
import { ICommandContext } from "../../../src/commands/interfaces/ICommand";
import { CLEAR_CHAT_COMMAND_ID } from "../../../src/Constants";

describe("ClearChatCommand", () => {
  let mockEditor: MockEditor;
  let mockNotificationService: MockNotificationService;
  let command: ClearChatCommand;
  let context: ICommandContext;

  beforeEach(() => {
    mockEditor = new MockEditor();
    mockNotificationService = new MockNotificationService();
    command = new ClearChatCommand(mockEditor, mockNotificationService);

    context = {
      editor: mockEditor,
      view: undefined,
      app: {} as any,
    };
  });

  describe("Command Properties", () => {
    it("should have correct id", () => {
      expect(command.id).toBe(CLEAR_CHAT_COMMAND_ID);
    });

    it("should have correct name", () => {
      expect(command.name).toBe("Clear chat (except frontmatter)");
    });
  });

  describe("Command Execution", () => {
    it("should clear chat content while preserving frontmatter", async () => {
      const contentWithFrontmatter = `---
model: gpt-4
temperature: 0.7
---

## role::user

Hello, how are you?

## role::assistant

I'm doing well, thank you for asking!

## role::user

What's the weather like?`;

      mockEditor.setValue(contentWithFrontmatter);

      await command.execute(context);

      const expectedResult = `---
model: gpt-4
temperature: 0.7
---

`;
      expect(mockEditor.getValue()).toBe(expectedResult);
    });

    it("should clear everything when no frontmatter exists", async () => {
      const contentWithoutFrontmatter = `## role::user

Hello, how are you?

## role::assistant

I'm doing well, thank you for asking!`;

      mockEditor.setValue(contentWithoutFrontmatter);

      await command.execute(context);

      expect(mockEditor.getValue()).toBe("");
    });

    it("should handle malformed frontmatter by clearing everything", async () => {
      const malformedContent = `---
model: gpt-4
temperature: 0.7

## role::user

Hello, this frontmatter has no closing delimiter!`;

      mockEditor.setValue(malformedContent);

      await command.execute(context);

      expect(mockEditor.getValue()).toBe("");
    });

    it("should handle empty content", async () => {
      mockEditor.setValue("");

      await command.execute(context);

      expect(mockEditor.getValue()).toBe("");
    });

    it("should handle content with only frontmatter", async () => {
      const onlyFrontmatter = `---
model: gpt-4
---`;

      mockEditor.setValue(onlyFrontmatter);

      await command.execute(context);

      const expectedResult = `---
model: gpt-4
---

`;
      expect(mockEditor.getValue()).toBe(expectedResult);
    });

    it("should handle frontmatter with empty content section", async () => {
      const frontmatterWithEmptyContent = `---
model: gpt-4
---

`;

      mockEditor.setValue(frontmatterWithEmptyContent);

      await command.execute(context);

      const expectedResult = `---
model: gpt-4
---

`;
      expect(mockEditor.getValue()).toBe(expectedResult);
    });
  });

  describe("Error Handling", () => {
    it("should throw error when no editor is provided", async () => {
      const contextWithoutEditor: ICommandContext = {
        editor: undefined,
        view: undefined,
        app: {} as any,
      };

      await expect(command.execute(contextWithoutEditor)).rejects.toThrow("Clear chat command requires an editor");
    });

    it("should handle editor errors gracefully", async () => {
      const errorMessage = "Editor operation failed";
      mockEditor.setValue = jest.fn().mockImplementation(() => {
        throw new Error(errorMessage);
      });
      mockEditor.getValue = jest.fn().mockReturnValue("some content");

      await expect(command.execute(context)).rejects.toThrow(`Failed to clear chat: ${errorMessage}`);

      expect(mockNotificationService.hasNotification("error", `Failed to clear chat: ${errorMessage}`)).toBe(true);
    });

    it("should handle non-Error exceptions", async () => {
      const errorMessage = "Unknown error";
      mockEditor.setValue = jest.fn().mockImplementation(() => {
        throw errorMessage;
      });
      mockEditor.getValue = jest.fn().mockReturnValue("some content");

      await expect(command.execute(context)).rejects.toThrow(`Failed to clear chat: ${errorMessage}`);

      expect(mockNotificationService.hasNotification("error", `Failed to clear chat: ${errorMessage}`)).toBe(true);
    });
  });

  describe("Complex Frontmatter Scenarios", () => {
    it("should handle frontmatter with nested objects", async () => {
      const complexFrontmatter = `---
model: gpt-4
system_commands:
  - You are a helpful assistant
  - Be concise
settings:
  temperature: 0.7
  max_tokens: 1000
---

## role::user

Complex question here`;

      mockEditor.setValue(complexFrontmatter);

      await command.execute(context);

      const expectedResult = `---
model: gpt-4
system_commands:
  - You are a helpful assistant
  - Be concise
settings:
  temperature: 0.7
  max_tokens: 1000
---

`;
      expect(mockEditor.getValue()).toBe(expectedResult);
    });

    it("should handle multiple --- delimiters correctly", async () => {
      const contentWithMultipleDelimiters = `---
model: gpt-4
---

## role::user

Here's some content with --- in it

---

## role::assistant

Response here`;

      mockEditor.setValue(contentWithMultipleDelimiters);

      await command.execute(context);

      const expectedResult = `---
model: gpt-4
---

`;
      expect(mockEditor.getValue()).toBe(expectedResult);
    });
  });
});
