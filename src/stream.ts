import { Editor, Platform } from "obsidian";
import { getHeaderRole, unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import {
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  ERROR_NO_CONNECTION,
  ROLE_ASSISTANT,
} from "src/Constants";
import { OpenAIStreamPayload } from "src/Services/OpenAiService";
import { OllamaStreamPayload } from "src/Services/OllamaService";
import { OpenRouterStreamPayload } from "src/Services/OpenRouterService";
import { ErrorHandlingOptions, ErrorService } from "src/Services/ErrorService";
import { NotificationService } from "src/Services/NotificationService";
import { StreamService } from "src/Services/StreamService";
import { EditorUpdateService } from "src/Services/EditorUpdateService";

/**
 * @deprecated Use StreamService and EditorUpdateService instead
 * This class is kept for backward compatibility
 */
export class StreamManager {
  private streamService: StreamService;
  private editorUpdateService: EditorUpdateService;
  private notificationService: NotificationService;

  constructor(errorService?: ErrorService, notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
    const editorUpdateService = new EditorUpdateService(this.notificationService);
    this.editorUpdateService = editorUpdateService;
    this.streamService = new StreamService(errorService, this.notificationService, editorUpdateService);
  }

  private handleEditorTextUpdate(editor: Editor, newText: string, cursorPosition: { line: number; ch: number }) {
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

  private insertAssistantHeader(editor: Editor, headingPrefix: string, model: string) {
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

  private finalizeText(
    editor: Editor,
    text: string,
    initialPos: {
      line: number;
      ch: number;
    },
    setAtCursor: undefined | boolean
  ) {
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

  /**
   * Stream content from an API and update the editor
   * @deprecated Use StreamService.stream instead
   */
  async stream(
    editor: Editor,
    url: string,
    options: OpenAIStreamPayload | OllamaStreamPayload | OpenRouterStreamPayload,
    headers: Record<string, string>,
    aiService: string,
    setAtCursor: boolean | undefined,
    headingPrefix: string
  ): Promise<string> {
    return this.streamService.stream(editor, url, options, headers, aiService, setAtCursor, headingPrefix);
  }

  /**
   * Stop the current streaming operation
   * @deprecated Use StreamService.stopStreaming instead
   */
  stopStreaming = (): void => {
    this.streamService.stopStreaming();
  };
}
