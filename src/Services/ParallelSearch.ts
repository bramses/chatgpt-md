import { requestUrl } from "obsidian";
import { WebSearchResult } from "src/Models/Tool";

const PARALLEL_MCP_URL = "https://mcp.parallel.ai/mcp";
const PROTOCOL_VERSION = "2025-03-26";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Obsidian buffers requestUrl responses; MCP can return JSON or finite SSE. */
function rpcResult(text: string, id: number): Record<string, unknown> {
  const messages: unknown[] = text.trimStart().startsWith("{")
    ? [JSON.parse(text) as unknown]
    : text.split(/\r?\n\r?\n/).flatMap((event) => {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        return data ? [JSON.parse(data) as unknown] : [];
      });
  const message = messages.map(record).find((item) => item?.id === id && item.jsonrpc === "2.0");
  const result = record(message?.result);
  if (message?.error || !result) throw new Error("Invalid Parallel MCP response");
  return result;
}

function searchResults(result: Record<string, unknown>, limit: number): WebSearchResult[] {
  if (result.isError) throw new Error("Parallel MCP search failed");
  let data = record(result.structuredContent);
  if (!data && Array.isArray(result.content)) {
    for (const item of result.content) {
      const block = record(item);
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      try {
        const parsed = record(JSON.parse(block.text) as unknown);
        if (Array.isArray(parsed?.results)) {
          data = parsed;
          break;
        }
      } catch {
        // Ignore non-JSON text blocks; only structured sources can be shared.
      }
    }
  }
  if (!Array.isArray(data?.results)) throw new Error("Missing Parallel search results");
  return data.results
    .flatMap((value): WebSearchResult[] => {
      const source = record(value);
      if (!source || typeof source.url !== "string") return [];
      try {
        const url = new URL(source.url);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return [];
      } catch {
        return [];
      }
      return [
        {
          title: typeof source.title === "string" && source.title ? source.title : "Untitled",
          url: source.url,
          snippet: Array.isArray(source.excerpts)
            ? source.excerpts.filter((excerpt): excerpt is string => typeof excerpt === "string").join("\n\n")
            : "",
        },
      ];
    })
    .slice(0, limit);
}

function postMcp(headers: Record<string, string>, message: Record<string, unknown>) {
  return requestUrl({ url: PARALLEL_MCP_URL, method: "POST", headers, body: JSON.stringify(message) });
}

/** Run only the approved public query; no credentials, vault context, or server instructions are forwarded. */
export async function searchParallel(query: string, limit: number): Promise<WebSearchResult[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": "ChatGPT-MD/3.3.1",
  };
  const initialized = await postMcp(headers, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "chatgpt-md", version: "3.3.1" },
    },
  });
  const initialization = rpcResult(initialized.text, 1);
  if (initialization.protocolVersion !== PROTOCOL_VERSION) throw new Error("Unsupported Parallel MCP protocol");
  headers["MCP-Protocol-Version"] = PROTOCOL_VERSION;
  const session = Object.entries(initialized.headers).find(([key]) => key.toLowerCase() === "mcp-session-id")?.[1];
  if (session) headers["Mcp-Session-Id"] = session;

  try {
    await postMcp(headers, { jsonrpc: "2.0", method: "notifications/initialized" });
    const response = await postMcp(headers, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "web_search",
        arguments: {
          objective: "Find public web sources relevant to the approved search query.",
          search_queries: [query],
        },
      },
    });
    return searchResults(rpcResult(response.text, 2), limit);
  } finally {
    if (session) {
      // Session cleanup must not discard successfully retrieved sources.
      await requestUrl({ url: PARALLEL_MCP_URL, method: "DELETE", headers }).catch(() => undefined);
    }
  }
}
