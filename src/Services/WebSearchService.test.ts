import { jest } from "@jest/globals";
import { requestUrl } from "obsidian";
import { WebSearchService } from "./WebSearchService";

const request = jest.mocked(requestUrl);
const source = {
  title: "Obsidian docs",
  url: "https://obsidian.md/help/community-plugins",
  excerpts: ["Install", "Enable"],
};
const initialized = { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } };
function response(value: unknown, headers: Record<string, string> = {}) {
  return { text: JSON.stringify(value), json: value, headers, status: 200, arrayBuffer: new ArrayBuffer(0) };
}
function searchResponse(result: unknown) {
  return response({ jsonrpc: "2.0", id: 2, result });
}
function setup() {
  request.mockReset();
  const showWarning = jest.fn();
  return { service: new WebSearchService({ showWarning } as never), showWarning };
}
function queueSearch(result: unknown) {
  request.mockResolvedValueOnce(response(initialized, { "mcp-session-id": "test-session" }));
  request.mockResolvedValueOnce(response({}));
  request.mockResolvedValueOnce(searchResponse(result));
  request.mockResolvedValueOnce(response({}));
}

describe("Parallel web search", () => {
  it("initializes MCP, sends only the approved query without credentials, and retains source URLs", async () => {
    const { service, showWarning } = setup();
    queueSearch({ content: [{ type: "text", text: JSON.stringify({ results: [source] }) }] });
    expect(
      await service.searchWeb({ query: "Obsidian community plugin installation" }, "parallel", "saved-brave-key")
    ).toEqual([{ title: source.title, url: source.url, snippet: "Install\n\nEnable" }]);
    const calls = request.mock.calls.map(
      ([options]) => options as { method: string; headers: Record<string, string>; body?: string; url: string }
    );
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "POST", "DELETE"]);
    expect(calls.every((call) => call.url === "https://mcp.parallel.ai/mcp")).toBe(true);
    expect(calls.every((call) => call.headers["User-Agent"] === "ChatGPT-MD/3.3.1")).toBe(true);
    expect(calls[2].headers["Mcp-Session-Id"]).toBe("test-session");
    expect(JSON.parse(calls[1].body!)).toEqual({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(JSON.parse(calls[2].body!)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "web_search",
        arguments: {
          objective: "Find public web sources relevant to the approved search query.",
          search_queries: ["Obsidian community plugin installation"],
        },
      },
    });
    expect(JSON.stringify(calls)).not.toContain("saved-brave-key");
    expect(showWarning).not.toHaveBeenCalled();
  });

  it("accepts SSE responses and structured sources, skips unsafe URLs, and applies the result limit", async () => {
    const { service } = setup();
    request.mockResolvedValueOnce({
      ...response({}),
      text: `event: message\r\ndata: ${JSON.stringify(initialized)}\r\n\r\n`,
    });
    request.mockResolvedValueOnce(response({}));
    const result = {
      jsonrpc: "2.0",
      id: 2,
      result: {
        structuredContent: {
          results: [
            { ...source, url: "javascript:alert(1)" },
            { ...source, url: "https://user:pass@example.com" },
            null,
            { url: "invalid" },
            source,
            { ...source, title: "Second" },
          ],
        },
      },
    };
    request.mockResolvedValueOnce({
      ...response({}),
      text: `: ping\n\nevent: message\ndata: ${JSON.stringify(result)}\n\n`,
    });
    const results = await service.searchWeb({ query: "public docs", limit: 1 }, "parallel");
    expect(results).toEqual([{ title: source.title, url: source.url, snippet: "Install\n\nEnable" }]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("returns an empty result without a warning for a successful empty search", async () => {
    const { service, showWarning } = setup();
    queueSearch({ structuredContent: { results: [] } });
    expect(await service.searchWeb({ query: "public docs" }, "parallel")).toEqual([]);
    expect(showWarning).not.toHaveBeenCalled();
  });

  it.each([
    { isError: true, content: [{ type: "text", text: "unavailable" }] },
    { content: [{ type: "text", text: "not JSON" }] },
    { structuredContent: { results: "invalid" } },
  ])("warns and returns no results for invalid/tool error responses: %j", async (result) => {
    const { service, showWarning } = setup();
    queueSearch(result);
    expect(await service.searchWeb({ query: "public docs" }, "parallel")).toEqual([]);
    expect(showWarning).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it.each(["http", "rpc", "malformed", "version"])("fails closed for %s errors", async (failure) => {
    const { service, showWarning } = setup();
    if (failure === "http") request.mockRejectedValueOnce(new Error("HTTP 429"));
    if (failure === "rpc") request.mockResolvedValueOnce(response({ jsonrpc: "2.0", id: 1, error: { code: -1 } }));
    if (failure === "malformed") request.mockResolvedValueOnce({ ...response({}), text: "data: {invalid}\n\n" });
    if (failure === "version")
      request.mockResolvedValueOnce(response({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "unknown" } }));
    expect(await service.searchWeb({ query: "public docs" }, "parallel")).toEqual([]);
    expect(showWarning).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps sources when optional session cleanup fails", async () => {
    const { service } = setup();
    request
      .mockResolvedValueOnce(response(initialized, { "Mcp-Session-Id": "test-session" }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(searchResponse({ structuredContent: { results: [source] } }))
      .mockRejectedValueOnce(new Error("HTTP 405"));
    expect(await service.searchWeb({ query: "public docs" }, "parallel")).toHaveLength(1);
  });
});

describe("existing web search providers", () => {
  it("still requires a Brave key without contacting Parallel", async () => {
    const { service, showWarning } = setup();
    expect(await service.searchWeb({ query: "public docs" }, "brave")).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(showWarning).toHaveBeenCalledTimes(1);
  });

  it("keeps Brave and custom request formats", async () => {
    const { service } = setup();
    request.mockResolvedValueOnce(
      response({ web: { results: [{ title: "Docs", url: source.url, description: "Brave" }] } })
    );
    expect(await service.searchWeb({ query: "public docs" }, "brave", "brave-test-key")).toEqual([
      { title: "Docs", url: source.url, snippet: "Brave" },
    ]);
    request.mockResolvedValueOnce(response({ results: [{ title: "Docs", url: source.url, snippet: "Custom" }] }));
    expect(
      await service.searchWeb({ query: "public docs" }, "custom", "custom-test-key", "https://search.example/search")
    ).toEqual([{ title: "Docs", url: source.url, snippet: "Custom" }]);
    expect(request.mock.calls.map(([options]) => (options as { url: string }).url)).toEqual([
      "https://api.search.brave.com/res/v1/web/search?q=public%20docs&count=5",
      "https://search.example/search?q=public%20docs&limit=5",
    ]);
  });
});
