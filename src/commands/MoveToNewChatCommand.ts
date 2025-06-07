import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { IEditor } from "../core/abstractions/IEditor";
import { INotificationService } from "../core/abstractions/INotificationService";

export interface MoveToNewChatDependencies {
  createNewChatWithHighlightedText(editor: IEditor, settings: any): Promise<void>;
  getSettings(): any;
}

/**
 * Command for creating a new chat with highlighted text
 */
export class MoveToNewChatCommand implements ICommand {
  id = "move-to-chat";
  name = "Create new chat with highlighted text";
  icon = "highlighter";

  constructor(
    private deps: MoveToNewChatDependencies,
    private notificationService: INotificationService
  ) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Move to new chat command requires an editor");
    }

    try {
      const settings = this.deps.getSettings();
      await this.deps.createNewChatWithHighlightedText(context.editor, settings);
    } catch (error) {
      const _errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ChatGPT MD] Error in Create new chat with highlighted text:", error);
      this.notificationService.showError("[ChatGPT MD] Error in Create new chat with highlighted text, check console");
    }
  }
}
