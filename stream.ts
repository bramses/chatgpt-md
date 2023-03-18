// import {
// 	createParser,
// 	ParsedEvent,
// 	ReconnectInterval,
// } from "eventsource-parser";

import { Editor } from "obsidian";
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

export const streamSSE = async (editor: Editor, apiKey: string, options: OpenAIStreamPayload) => {
  console.log("streamSSE", options)

	const url = "https://api.openai.com/v1/chat/completions";
// Write the game of pong. Write it as a python script

	const source = new SSE(url, {
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		method: "POST",
		payload: JSON.stringify(options),
	});

  let txt = ""
  const initialCursorPosCh = editor.getCursor().ch
  const initialCursorPosLine = editor.getCursor().line
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
      
			const cm6 = editor.cm;
			const transaction = cm6.state.update({
				changes: { from: convPos, to: convPos, insert: text },
			});
			cm6.dispatch(transaction);
			// const cursor = editor.getCursor();
			// editor.replaceRange(text, cursor);

      txt += text

			const newCursor = {
				line: cursor.line,
				ch: cursor.ch + text.length,
			};
			editor.setCursor(newCursor);
		} else {
			source.close();
      console.log("txt", txt)

      // replace the text from initialCursor to fix any formatting issues
      const cursor = editor.getCursor();
      editor.replaceRange(txt, {line: initialCursorPosLine, ch: initialCursorPosCh}, cursor);


		}
	});

	source.addEventListener("readystatechange", (e: any) => {
		if (e.readyState >= 2) {
			console.log("ReadyState: " + e.readyState);
		}
	});

	source.stream();
};
