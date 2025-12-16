// Conditional imports for Node.js modules (only available on desktop)
let httpRequest: any;
let httpsRequest: any;
let URL: any;

// Try to load Node.js modules using require
try {
  const nodeRequire = (globalThis as any).require;
  const http = nodeRequire("http");
  const https = nodeRequire("https");
  const url = nodeRequire("url");

  httpRequest = http.request;
  httpsRequest = https.request;
  URL = url.URL;
} catch (_error) {
  // Node.js modules not available (mobile environment)
  httpRequest = null;
  httpsRequest = null;
  URL = globalThis.URL; // Use Web API URL instead
}

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
 * A streaming HTTP request function that bypasses CORS using Node.js HTTP modules on desktop
 * Falls back to fetch() on mobile environments where Node.js modules are not available
 *
 * @param options Request options
 * @returns Promise<Response> - Web API compatible Response object
 */
export async function requestStream(options: RequestStreamParam): Promise<Response> {
  // Check if Node.js HTTP modules are available (desktop environment)
  if (httpRequest && httpsRequest) {
    return requestStreamNodeHttp(options);
  } else {
    // Fallback to fetch() for mobile environments
    return requestStreamFetch(options);
  }
}

/**
 * Node.js HTTP implementation (desktop only)
 */
async function requestStreamNodeHttp(options: RequestStreamParam): Promise<Response> {
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

    const req = request(requestOptions, (res: any) => {
      const headers = new Headers();

      // Convert Node.js headers to Web API Headers
      Object.entries(res.headers).forEach(([key, value]) => {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
        }
      });

      const status = res.statusCode || 0;
      const ok = status >= 200 && status < 300;

      // Create a ReadableStream from the Node.js response
      const body = new ReadableStream({
        start(controller) {
          res.on("data", (chunk: any) => {
            controller.enqueue(new Uint8Array(chunk));
          });

          res.on("end", () => {
            controller.close();
          });

          res.on("error", (err: any) => {
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

    req.on("error", (error: any) => {
      reject(error);
    });

    // Write body data if present
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Fetch implementation (mobile fallback)
 */
async function requestStreamFetch(options: RequestStreamParam): Promise<Response> {
  // Only add Content-Type if not already present in options.headers
  const headers: Record<string, string> = {
    ...(options.headers && !options.headers["Content-Type"] && !options.headers["content-type"]
      ? { "Content-Type": "application/json" }
      : {}),
    ...options.headers,
  };

  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    headers,
    signal: options.signal,
  };

  if (options.body) {
    fetchOptions.body = options.body;
  }

  return await fetch(options.url, fetchOptions);
}
