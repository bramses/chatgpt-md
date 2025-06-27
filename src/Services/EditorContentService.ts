import { Editor, App, MarkdownView } from "obsidian";
import { getHeaderRole, getHeadingPrefix } from "src/Utilities/TextHelpers";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
import { HORIZONTAL_LINE_CLASS, NEWLINE, ROLE_ASSISTANT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";

/**
 * Service responsible for editor content manipulation
 */
export class EditorContentService {
  private frontmatterManager?: FrontmatterManager;

  constructor(private app?: App) {
    if (app) {
      this.frontmatterManager = new FrontmatterManager(app);
    }
  }
  /**
   * Add a horizontal rule with a role header
   */
  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    const formattedContent = `${NEWLINE}<hr class="${HORIZONTAL_LINE_CLASS}">${NEWLINE}${getHeadingPrefix(headingLevel)}${ROLE_IDENTIFIER}${role}${NEWLINE}`;

    const currentPosition = editor.getCursor();

    editor.replaceRange(formattedContent, currentPosition);
    editor.setCursor(currentPosition.line + formattedContent.split("\n").length - 1, 0);
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
  }

  /**
   * Clear the chat content, preserving frontmatter using FrontmatterManager
   */
  async clearChat(editor: Editor): Promise<void> {
    let frontmatterContent = "";

    // Try to use FrontmatterManager to preserve frontmatter
    if (this.app && this.frontmatterManager) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView?.file) {
        try {
          const frontmatter = await this.frontmatterManager.readFrontmatter(activeView.file);
          if (frontmatter && Object.keys(frontmatter).length > 0) {
            // Reconstruct frontmatter from the data
            const frontmatterEntries = Object.entries(frontmatter)
              .filter(([key]) => key !== "position") // Exclude Obsidian's internal position data
              .map(([key, value]) => {
                if (typeof value === "string") {
                  return `${key}: "${value}"`;
                }
                return `${key}: ${value}`;
              });

            if (frontmatterEntries.length > 0) {
              frontmatterContent = `---\n${frontmatterEntries.join("\n")}\n---\n\n`;
            }
          }
        } catch (error) {
          console.error("[EditorContentService] Error reading frontmatter:", error);
        }
      }
    }

    // Clear editor and restore frontmatter
    editor.setValue(frontmatterContent);

    // Position cursor at the end of the document
    if (frontmatterContent) {
      editor.setCursor({ line: editor.lastLine() + 1, ch: 0 });
    } else {
      editor.setCursor({ line: 0, ch: 0 });
    }
  }

  /**
   * Move the cursor to the end of the document
   */
  moveCursorToEnd(editor: Editor): void {
    try {
      const length = editor.lastLine();

      const newCursor = {
        line: length + 1,
        ch: 0,
      };
      editor.setCursor(newCursor);
    } catch (err) {
      throw new Error("Error moving cursor to end of file" + err);
    }
  }

  /**
   * Add a comment block at the cursor position
   */
  addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
    const cursor = editor.getCursor();
    const commentBlock = `${commentStart}${NEWLINE}${commentEnd}`;

    editor.replaceRange(commentBlock, cursor);

    // Move cursor to middle of comment block
    editor.setCursor({
      line: cursor.line + 1,
      ch: cursor.ch,
    });
  }
}
