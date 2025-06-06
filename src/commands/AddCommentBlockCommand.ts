import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { IEditor } from "../core/abstractions/IEditor";
import { ADD_COMMENT_BLOCK_COMMAND_ID, COMMENT_BLOCK_START, COMMENT_BLOCK_END, NEWLINE } from "../Constants";

/**
 * AddCommentBlockCommand - Adds a comment block at the current cursor position
 *
 * This command inserts a ChatGPT MD comment block that can be used to add
 * notes or comments that won't be processed by the AI. The cursor is positioned
 * inside the comment block for immediate editing.
 */
export class AddCommentBlockCommand implements ICommand {
  readonly id = ADD_COMMENT_BLOCK_COMMAND_ID;
  readonly name = "Add comment block";
  readonly icon = "comment";

  constructor(private editor: IEditor) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Add comment block command requires an editor");
    }

    this.addCommentBlock(context.editor);
  }

  /**
   * Add a comment block at the current cursor position
   */
  private addCommentBlock(editor: IEditor): void {
    const cursor = editor.getCursor();
    const line = cursor.line;
    const ch = cursor.ch;

    // Create comment block with proper formatting
    const commentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;
    editor.replaceRange(commentBlock, cursor);

    // Position cursor inside the comment block for immediate editing
    const newCursor = {
      line: line + 1,
      ch: ch,
    };
    editor.setCursor(newCursor);
  }
}
