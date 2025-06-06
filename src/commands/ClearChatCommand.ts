import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { IEditor } from "../core/abstractions/IEditor";
import { INotificationService } from "../core/abstractions/INotificationService";
import { CLEAR_CHAT_COMMAND_ID } from "../Constants";

/**
 * ClearChatCommand - Clears chat content while preserving frontmatter
 *
 * This command removes all chat content from the current note while keeping
 * the frontmatter intact. If no frontmatter exists, it clears the entire document.
 */
export class ClearChatCommand implements ICommand {
  readonly id = CLEAR_CHAT_COMMAND_ID;
  readonly name = "Clear chat (except frontmatter)";

  constructor(
    private editor: IEditor,
    private notificationService: INotificationService
  ) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Clear chat command requires an editor");
    }

    try {
      this.clearChatContent(context.editor);
    } catch (error) {
      const message = `Failed to clear chat: ${error instanceof Error ? error.message : String(error)}`;
      this.notificationService.showError(message);
      throw new Error(message);
    }
  }

  /**
   * Clear chat content while preserving frontmatter
   */
  private clearChatContent(editor: IEditor): void {
    const content = editor.getValue();
    const lines = content.split("\n");

    // Check if frontmatter exists
    if (lines[0] === "---") {
      // Find end of frontmatter
      let endIndex = -1;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i] === "---") {
          endIndex = i;
          break;
        }
      }

      if (endIndex !== -1) {
        // Preserve frontmatter and add empty lines for new content
        const frontmatterSection = lines.slice(0, endIndex + 1).join("\n");
        editor.setValue(frontmatterSection + "\n\n");
        return;
      }
    }

    // No frontmatter found, clear everything
    editor.setValue("");
  }
}
