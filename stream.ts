// import {
// 	createParser,
// 	ParsedEvent,
// 	ReconnectInterval,
// } from "eventsource-parser";

import { Editor, Notice } from "obsidian";
import { SSE } from "sse";

export interface OpenAIStreamPayload {
	model: string;
	messages: Array<{ role: string; content: string }>;
	temperature: number;
	top_p: number;
	presence_penalty: number;
	frequency_penalty: number;
	stop: string[] | null;
	n: number;
	logit_bias?: any | null;
	user?: string | null;
	max_tokens: number;
	stream: boolean;
}

// todo: await this function and return the text on stream completion
export const streamSSE = async (
	editor: Editor,
	apiKey: string,
	options: OpenAIStreamPayload,
	setAtCursor: boolean
) => {
  return new Promise((resolve, reject) => {
    try {
      console.log("streamSSE", options);
  
      const url = "https://api.openai.com/v1/chat/completions";
  
      const source = new SSE(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        method: "POST",
        payload: JSON.stringify(options),
      });
  
      let txt = "";
      const initialCursorPosCh = editor.getCursor().ch;
      const initialCursorPosLine = editor.getCursor().line;
      source.addEventListener("message", (e: any) => {
        if (e.data != "[DONE]") {
          const payload = JSON.parse(e.data);
          const text = payload.choices[0].delta.content;
  
          // if text undefined, then do nothing
          if (!text) {
            return;
          }
  
          const cursor = editor.getCursor();
          const convPos = editor.posToOffset(cursor);
  
          // @ts-ignore
          const cm6 = editor.cm;
          const transaction = cm6.state.update({
            changes: { from: convPos, to: convPos, insert: text },
          });
          cm6.dispatch(transaction);
  
  
          txt += text;
  
          const newCursor = {
            line: cursor.line,
            ch: cursor.ch + text.length,
          };
          editor.setCursor(newCursor);
        } else {
          source.close();
  
          // replace the text from initialCursor to fix any formatting issues from streaming
          const cursor = editor.getCursor();
          editor.replaceRange(
            txt,
            { line: initialCursorPosLine, ch: initialCursorPosCh },
            cursor
          );
  
          // set cursor to end of replacement text
          const newCursor = {
            line: initialCursorPosLine,
            ch: initialCursorPosCh + txt.length,
          };
          editor.setCursor(newCursor);
  
          // remove extraneous text
          // const textAfterCursor = editor.getRange(newCursor, {
          // 	line: Infinity,
          // 	ch: Infinity,
          // });
  
          if (!setAtCursor) {
            // remove the text after the cursor
            editor.replaceRange("", newCursor, {
              line: Infinity,
              ch: Infinity,
            });
          } else {
            new Notice(
              "[ChatGPT MD] Text pasted at cursor may leave artifacts. Please remove them manually. ChatGPT MD cannot safely remove text when pasting at cursor."
            );
          }
  
          resolve(txt);
          // return txt;
        }
      });
  
      source.addEventListener("readystatechange", (e: any) => {
        if (e.readyState >= 2) {
          console.log("ReadyState: " + e.readyState);
        }
      });
  
      source.stream();
    } catch (err) {
      console.error(err);
      new Notice("[ChatGPT MD] Error streaming text. Please check console.");
      reject(err);
    }
  });
};
