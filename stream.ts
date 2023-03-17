// import {
// 	createParser,
// 	ParsedEvent,
// 	ReconnectInterval,
// } from "eventsource-parser";

import { Editor } from "obsidian";
import { SSE } from "sse"

  export interface OpenAIStreamPayload {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
    presence_penalty: number;
    max_tokens: number;
    stream: boolean;
  }

export const main = async (editor: Editor) => {

    const data: OpenAIStreamPayload = {
        model: "gpt-3.5-turbo",
        messages: [
            {
                role: "system",
                content: "A conversation between two people.",
            },
            { role: "user", content: "Write the game of pong. Write it as a python script" },
        ],
        temperature: 0.5,
        presence_penalty: 1,
        max_tokens: 1000,
        stream: true, // Enable streaming in response
    };
    const url = "https://api.openai.com/v1/chat/completions"
    
    console.log(SSE)


    const source = new SSE(url, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer`,
        },
        method: "POST",
        payload: JSON.stringify(data),
      });

      source.addEventListener("message", (e: any) => {
        if (e.data != "[DONE]") {
          const payload = JSON.parse(e.data);
          const text = payload.choices[0].delta.content;

          // if text undefined, then do nothing
            if (!text) {
                return;
            }

            console.log("Received message: " + text);
            const cursor = editor.getCursor();
            editor.replaceRange(text, cursor);
								
            const newCursor = {
                line: cursor.line,
                ch: cursor.ch + text.length,
            };
            editor.setCursor(newCursor);

        } else {
          source.close();
        }
      });

      source.addEventListener("readystatechange", (e: any) => {
        if (e.readyState >= 2) {
          console.log("ReadyState: " + e.readyState);
        }
      });

      source.stream();
}


// attempt 3

// import { IncomingMessage } from "http";

//   export interface OpenAIStreamPayload {
//     model: string;
//     messages: Array<{ role: string; content: string }>;
//     temperature: number;
//     presence_penalty: number;
//     max_tokens: number;
//     stream: boolean;
//   }

//   export const ChatCompletionRequestMessageRoleEnum = {
//     System: 'system',
//     User: 'user',
//     Assistant: 'assistant'
// } as const;

// export type ChatCompletionRequestMessageRoleEnum = typeof ChatCompletionRequestMessageRoleEnum[keyof typeof ChatCompletionRequestMessageRoleEnum];

//   export interface ChatCompletionRequestMessage {
//     /**
//      * The role of the author of this message.
//      * @type {string}
//      * @memberof ChatCompletionRequestMessage
//      */
//     'role': ChatCompletionRequestMessageRoleEnum;
//     /**
//      * The contents of the message
//      * @type {string}
//      * @memberof ChatCompletionRequestMessage
//      */
//     'content': string;
//     /**
//      * The name of the user in a multi-user chat
//      * @type {string}
//      * @memberof ChatCompletionRequestMessage
//      */
//     'name'?: string;
// }


// export interface ChatCompletionResponseMessage {
//     /**
//      * The role of the author of this message.
//      * @type {string}
//      * @memberof ChatCompletionResponseMessage
//      */
//     'role': ChatCompletionResponseMessageRoleEnum;
//     /**
//      * The contents of the message
//      * @type {string}
//      * @memberof ChatCompletionResponseMessage
//      */
//     'content': string;
// }

// export const ChatCompletionResponseMessageRoleEnum = {
//     System: 'system',
//     User: 'user',
//     Assistant: 'assistant'
// } as const;

// export type ChatCompletionResponseMessageRoleEnum = typeof ChatCompletionResponseMessageRoleEnum[keyof typeof ChatCompletionResponseMessageRoleEnum];




// export async function* main() {
// 	try {
// 		const payload: OpenAIStreamPayload = {
// 			model: "gpt-3.5-turbo",
// 			messages: [
// 				{
// 					role: "system",
// 					content: "A conversation between two people.",
// 				},
// 				{ role: "user", content: "What is the meaning of life?" },
// 			],
// 			temperature: 0.5,
// 			presence_penalty: 1,
// 			max_tokens: 100,
// 			stream: true, // Enable streaming in response
// 		};
// 		const result = await fetch("https://api.openai.com/v1/chat/completions", {
// 			headers: {
// 				"Content-Type": "application/json",
// 				Authorization: `Bearer`, //< DO NOT COMMIT
// 			},
// 			method: "POST",
// 			body: JSON.stringify(payload),
// 		});

//         const text = await result.text();

// 		const stream = text as any as IncomingMessage;

//         console.log ("stream", stream)
// 		for await (const chunk of stream) {
//             console.log("chunk", chunk);
// 			const line = chunk.toString().trim();
// 			const message = line.split("data: ")[1];

// 			if (message === "[DONE]") {
// 				break;
// 			}

// 			const data = JSON.parse(message) as any;

// 			yield data.choices[0].delta.content;
// 		}
// 	} catch (error) {
// 		// if (fallback) yield fallback;
// 		console.error(error);
// 	}
// }

// function onParse(event: ParsedEvent | ReconnectInterval) {
// 	if (event.type === "event") {
// 		console.log("Received event!");
// 		console.log("id:%s", event.id || "<none>");
// 		console.log("name:%s", event.type || "<none>");
// 		console.log("data:%s", event.data);
// 	} else if (event.type === "reconnect-interval") {
// 		console.log(
// 			"We should set reconnect interval to %d milliseconds",
// 			event.value
// 		);
// 	}
// }

// export const main = async () => {
// 	const res = await fetch("https://api.openai.com/v1/chat/completions", {
// 		headers: {
// 			"Content-Type": "application/json",
// 			Authorization: `Bearer`, //< DO NOT COMMIT
// 		},
// 		method: "POST",
// 		body: JSON.stringify(payload),
// 	});

// 	//Create Parser Instance.
// 	const parser = createParser(onParse);

// 	for await (const chunk of res.body as any) {
// 		parser.feed(chunk);
// 	}

// 	parser.reset();
// 	console.log("Done!");
// };

// ...

//   export interface OpenAIStreamPayload {
//     model: string;
//     messages: Array<{ role: string; content: string }>;
//     temperature: number;
//     presence_penalty: number;
//     max_tokens: number;
//     stream: boolean;
//   }

//   export async function OpenAIStream(payload: OpenAIStreamPayload) {

//     const encoder = new TextEncoder();
//     const decoder = new TextDecoder();

//     console.log("OpenAIStream", payload);

//     const res = await fetch("https://api.openai.com/v1/chat/completions", {
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer `, // < DO NOT COMMIT
//       },
//       method: "POST",
//       body: JSON.stringify(payload),
//     });

//     const stream = new ReadableStream({
//       async start(controller) {
//         // callback
//         function onParse(event: ParsedEvent | ReconnectInterval) {
//             console.log("onParse", event);
//           if (event.type === "event") {
//             const data = event.data;
//             if (data === "[DONE]") {
//               controller.close();
//               return;
//             }
//             try {
//               const json = JSON.parse(data);
//               const text = json.choices[0].delta.content;
//               const queue = encoder.encode(text);
//               controller.enqueue(queue);
//               console.log("onParse", text);
//             } catch (e) {
//               // maybe parse error
//               controller.error(e);
//             }
//           }
//         }

//         // stream response (SSE) from OpenAI may be fragmented into multiple chunks
//         // this ensures we properly read chunks and invoke an event for each SSE event stream
//         const parser = createParser(onParse);
//         // https://web.dev/streams/#asynchronous-iteration
//         for await (const chunk of res.body as any) {
//           parser.feed(decoder.decode(chunk));
//         }
//       },
//     });

//     return stream;
//   }

// export const main = async () => {
//     const payload: OpenAIStreamPayload = {
//         model: "gpt-3.5-turbo",
//         messages: [{ role: "user", content: "Write a poem about Abe Lincoln" }],
//         temperature: 0.9,
//         presence_penalty: 0.6,
//         max_tokens: 100,
//         stream: true,
//       };
//       const stream = await OpenAIStream(payload);
//       return new Response(stream);
//     }
