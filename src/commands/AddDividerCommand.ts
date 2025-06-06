import { ICommand, ICommandContext } from "./interfaces/ICommand";
import { ROLE_USER } from "../Constants";

export interface AddDividerDependencies {
  getHeadingLevel(): number;
}

/**
 * Command to add a divider with role heading
 * This is a simple, focused command that demonstrates the new pattern
 */
export class AddDividerCommand implements ICommand {
  id = "add-hr";
  name = "Add divider";
  icon = "minus";

  constructor(private deps: AddDividerDependencies) {}

  async execute(context: ICommandContext): Promise<void> {
    if (!context.editor) {
      throw new Error("Add divider command requires an editor");
    }

    const headingLevel = this.deps.getHeadingLevel();
    const headingPrefix = "#".repeat(headingLevel);
    const horizontalRule = '<hr class="__chatgpt_plugin">';
    const divider = `\n\n${horizontalRule}\n\n${headingPrefix} role::${ROLE_USER}\n\n`;

    const cursor = context.editor.getCursor();
    context.editor.replaceRange(divider, cursor);

    // Move cursor to end of inserted content
    const newLine = cursor.line + 5; // 2 newlines + hr + 2 newlines + heading
    context.editor.setCursor({ line: newLine, ch: 0 });
  }
}
