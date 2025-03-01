import { Editor } from "obsidian";
import { getHeaderRole, unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import { ROLE_ASSISTANT } from "src/Constants";
import { NotificationService } from "./NotificationService";

/**
 * Service responsible for updating the editor with streamed content
 */
export class EditorUpdateService {
  constructor(private notificationService: NotificationService) {}

  /**
   * Update the editor with new text at the current cursor position
   */
  updateEditorText(
    editor: Editor,
    newText: string,
    cursorPosition: { line: number; ch: number }
  ): { line: number; ch: number } {
    const updatedPosition = editor.posToOffset(cursorPosition);

    // @ts-ignore
    const codeMirrorInstance = editor.cm;
    codeMirrorInstance.dispatch(
      codeMirrorInstance.state.update({
        changes: {
          from: updatedPosition,
          to: updatedPosition,
          insert: newText,
        },
      })
    );

    const newCursorPosition = {
      line: cursorPosition.line,
      ch: cursorPosition.ch + newText.length,
    };
    editor.setCursor(newCursorPosition);
    return newCursorPosition;
  }

  /**
   * Insert the assistant header at the current cursor position
   */
  insertAssistantHeader(editor: Editor, headingPrefix: string, model: string): { line: number; ch: number } {
    const newLine = getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);

    editor.replaceRange(newLine, editor.getCursor());

    const cursor = editor.getCursor();
    const newCursor = {
      line: cursor.line,
      ch: cursor.ch + newLine.length,
    };
    editor.setCursor(newCursor);
    return newCursor;
  }

  /**
   * Finalize the text in the editor, handling code blocks and cursor positioning
   */
  finalizeText(
    editor: Editor,
    text: string,
    initialPos: { line: number; ch: number },
    setAtCursor: undefined | boolean
  ): string {
    const finalText = unfinishedCodeBlock(text) ? text + "\n```" : text;
    const cursor = editor.getCursor();

    editor.replaceRange(
      finalText,
      {
        line: initialPos.line,
        ch: initialPos.ch,
      },
      cursor
    );

    const newCursor = {
      line: initialPos.line,
      ch: initialPos.ch + finalText.length,
    };
    editor.setCursor(newCursor);

    if (!setAtCursor) {
      editor.replaceRange("", newCursor, {
        line: Infinity,
        ch: Infinity,
      });
    } else {
      this.notificationService.showWarning(
        "Text pasted at cursor may leave artifacts. Please remove them manually. ChatGPT MD cannot safely remove text when pasting at cursor."
      );
    }

    return finalText;
  }
}
