import { IncomingMessage, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { URL } from "url";

/**
 * Options for streaming HTTP requests (similar to Obsidian's RequestUrlParam)
 */
interface RequestStreamParam {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * A streaming HTTP request function that bypasses CORS using Node.js HTTP modules
 * Similar to Obsidian's requestUrl but for streaming responses
 *
 * @param options Request options
 * @returns Promise<Response> - Web API compatible Response object
 */
export async function requestStream(options: RequestStreamParam): Promise<Response> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(options.url);
    const isHttps = urlObj.protocol === "https:";
    const request = isHttps ? httpsRequest : httpRequest;

    const requestOptions = {
      hostname: urlObj.hostname === "localhost" ? "127.0.0.1" : urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    const req = request(requestOptions, (res: IncomingMessage) => {
      const headers = new Headers();

      // Convert Node.js headers to Web API Headers
      Object.entries(res.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
      });

      const status = res.statusCode || 0;
      const ok = status >= 200 && status < 300;

      // Create a ReadableStream from the Node.js response
      const body = new ReadableStream({
        start(controller) {
          res.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          res.on("end", () => {
            controller.close();
          });

          res.on("error", (err) => {
            controller.error(err);
          });
        },
      });

      // Create a Web API compatible Response object
      const response = {
        ok,
        status,
        statusText: res.statusMessage || "",
        headers,
        body,

        json: async (): Promise<any> => {
          const reader = body.getReader();
          const chunks: Uint8Array[] = [];

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }

            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;

            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }

            const text = new TextDecoder().decode(combined);
            return JSON.parse(text);
          } finally {
            reader.releaseLock();
          }
        },

        text: async (): Promise<string> => {
          const reader = body.getReader();
          const chunks: Uint8Array[] = [];

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }

            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;

            for (const chunk of chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }

            return new TextDecoder().decode(combined);
          } finally {
            reader.releaseLock();
          }
        },

        clone: (): Response => {
          throw new Error("Response cloning not implemented for requestStream");
        },
      } as Response;

      resolve(response);
    });

    // Handle request abortion
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        req.destroy();
        reject(new Error("Request aborted"));
      });
    }

    req.on("error", (error) => {
      reject(error);
    });

    // Write body data if present
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}
