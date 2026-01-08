import { App, Editor, MarkdownView } from "obsidian";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
import { addHorizontalRule, appendMessage, moveCursorToEnd, addCommentBlock } from "src/Utilities/EditorHelpers";
import { NEWLINE } from "src/Constants";

/**
 * Service responsible for editor content manipulation
 * Now uses utility functions for common operations
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
   * Delegates to utility function
   */
  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    addHorizontalRule(editor, role, headingLevel);
  }

  /**
   * Append a message to the editor
   * Delegates to utility function
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    appendMessage(editor, message, headingLevel);
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
   * Delegates to utility function
   */
  moveCursorToEnd(editor: Editor): void {
    moveCursorToEnd(editor);
  }

  /**
   * Add a comment block at the cursor position
   * Delegates to utility function
   */
  addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
    addCommentBlock(editor, commentStart, commentEnd);
  }
}
