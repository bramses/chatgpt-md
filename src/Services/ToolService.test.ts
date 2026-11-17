import { jest } from "@jest/globals";
import { z } from "zod";
import { ToolApprovalGateway } from "./Tools/ToolApprovalCoordinator";
import { ToolService } from "./ToolService";
import { ApiAuthService } from "./ApiAuthService";
import { requestUrl } from "obsidian";
import { DEFAULT_SETTINGS } from "src/Models/Config";

class FakeSecretComponent {
  constructor(_app: never, _container: never) {}
}

describe("ToolService", () => {
  it("keeps executors private until the user approval flow runs", () => {
    const service = createService(createApprovalGateway({ approved: true, approvalId: "approval" }));
    const declarations = service.getToolsForRequest({
      enableToolCalling: true,
      webSearchProvider: "brave",
      webSearchApiKey: "",
      webSearchApiUrl: "",
    } as never);

    expect(declarations?.vault_search.execute).toBeUndefined();
    expect(declarations?.file_read.execute).toBeUndefined();
    expect(typeof service.getTool("vault_search")?.execute).toBe("function");
    expect(typeof service.getTool("file_read")?.execute).toBe("function");
  });

  it("never executes a rejected tool call", async () => {
    const execute = jest.fn(async () => "private data");
    const service = createService(createApprovalGateway({ approved: false, approvalId: "approval" }));
    service.registerTool("test_tool", { description: "test", inputSchema: z.object({}), execute });

    const results = await service.handleToolCalls([{ toolCallId: "1", toolName: "test_tool", input: {} }]);

    expect(execute).not.toHaveBeenCalled();
    expect(results[0].result).toEqual({ error: "User declined tool execution" });
  });

  it("executes approved modified arguments", async () => {
    const execute = jest.fn(async (args: Record<string, unknown>) => args);
    const service = createService(
      createApprovalGateway({ approved: true, approvalId: "approval", modifiedArgs: { query: "approved" } })
    );
    service.registerTool("test_tool", {
      description: "test",
      inputSchema: z.object({ query: z.string() }),
      execute,
    });

    await service.handleToolCalls([{ toolCallId: "1", toolName: "test_tool", input: { query: "unapproved" } }]);

    expect(execute).toHaveBeenCalledWith({ query: "approved" }, expect.objectContaining({ toolCallId: "1" }));
  });

  it("fails closed for malformed tool calls", async () => {
    const approval = createApprovalGateway({ approved: true, approvalId: "approval" });
    const service = createService(approval);

    const results = await service.handleToolCalls([null, { toolName: "", input: {} }, { toolName: "x", input: [] }]);

    expect(approval.approveTool).not.toHaveBeenCalled();
    expect(results.every((result) => /invalid/i.test((result.result as { error: string }).error))).toBe(true);
  });

  it("only adds approved web results to model context", async () => {
    const approval = createApprovalGateway({ approved: true, approvalId: "approval" });
    approval.approveWebResults.mockImplementation(async (_query, results) => ({
      approved: true,
      approvedResults: results.slice(0, 1),
    }));
    const service = createService(approval);
    const calls = [{ toolCallId: "1", toolName: "web_search", input: { query: "privacy" } }];
    const results = [
      {
        toolCallId: "1",
        result: [
          { title: "Approved", url: "https://approved", snippet: "visible" },
          { title: "Rejected", url: "https://rejected", snippet: "private" },
        ],
      },
    ];

    const processed = await service.processToolResults(calls, results);

    expect(processed.contextMessages).toHaveLength(1);
    expect(processed.contextMessages[0].content).toContain("visible");
    expect(processed.contextMessages[0].content).not.toContain("private");
  });

  it("resolves secure web-search credentials only for approved execution", async () => {
    const storage = {
      setSecret: jest.fn(),
      getSecret: jest.fn(() => "resolved-web-secret"),
      listSecrets: jest.fn(() => ["selected-web-secret"]),
    };
    const auth = new ApiAuthService({ secretStorage: storage }, FakeSecretComponent);
    const settings = {
      ...DEFAULT_SETTINGS,
      enableToolCalling: true,
      webSearchApiKey: "",
      webSearchApiKeySecretId: "selected-web-secret",
    };
    const searchWeb = jest.fn(async () => []);
    const approval = createApprovalGateway({ approved: true, approvalId: "approval" });
    const service = new ToolService(
      {} as never,
      {} as never,
      { showWarning: jest.fn() } as never,
      settings,
      undefined,
      { searchWeb } as never,
      approval,
      auth
    );

    expect(service.getToolsForRequest(settings)?.web_search).toBeDefined();
    await service.handleToolCalls([{ toolCallId: "web", toolName: "web_search", input: { query: "privacy" } }]);

    expect(searchWeb).toHaveBeenCalledWith(
      expect.objectContaining({ query: "privacy" }),
      "brave",
      "resolved-web-secret",
      ""
    );
  });

  it("does not resolve or execute secure web search when approval is rejected", async () => {
    const storage = {
      setSecret: jest.fn(),
      getSecret: jest.fn(() => "resolved-web-secret"),
      listSecrets: jest.fn(() => ["selected-web-secret"]),
    };
    const auth = new ApiAuthService({ secretStorage: storage }, FakeSecretComponent);
    const settings = { ...DEFAULT_SETTINGS, webSearchApiKeySecretId: "selected-web-secret" };
    const searchWeb = jest.fn(async () => []);
    const service = new ToolService(
      {} as never,
      {} as never,
      { showWarning: jest.fn() } as never,
      settings,
      undefined,
      { searchWeb } as never,
      createApprovalGateway({ approved: false, approvalId: "approval" }),
      auth
    );
    storage.getSecret.mockClear();

    await service.handleToolCalls([{ toolCallId: "web", toolName: "web_search", input: { query: "privacy" } }]);

    expect(searchWeb).not.toHaveBeenCalled();
    expect(storage.getSecret).not.toHaveBeenCalled();
  });

  it("exposes keyless Parallel only with tools enabled and preserves both approval boundaries", async () => {
    const settings = { ...DEFAULT_SETTINGS, enableToolCalling: true, webSearchProvider: "parallel" as const };
    const approval = createApprovalGateway({ approved: false, approvalId: "approval" });
    const auth = new ApiAuthService();
    const resolveCredential = jest.spyOn(auth, "resolveWebSearchCredential");
    const service = new ToolService(
      {} as never,
      {} as never,
      { showWarning: jest.fn() } as never,
      settings,
      undefined,
      undefined,
      approval,
      auth
    );
    const request = jest.mocked(requestUrl);
    request.mockReset();
    expect(DEFAULT_SETTINGS.enableToolCalling).toBe(false);
    expect(DEFAULT_SETTINGS.webSearchProvider).toBe("brave");
    expect(service.getToolsForRequest({ ...settings, enableToolCalling: false })).toBeUndefined();
    expect(service.getToolsForRequest(settings)?.web_search).toBeDefined();
    expect(service.getToolsForRequest(settings)?.web_search).not.toHaveProperty("execute");
    expect(request).not.toHaveBeenCalled();
    const calls = [{ toolCallId: "web", toolName: "web_search", input: { query: "original query" } }];
    await service.handleToolCalls(calls);
    expect(request).not.toHaveBeenCalled();
    approval.approveTool.mockResolvedValue({
      approved: true,
      approvalId: "approval",
      modifiedArgs: { query: "approved public query" },
    });
    const sources = [
      { title: "Selected", url: "https://obsidian.md/help/community-plugins", excerpts: ["Selected excerpt"] },
      { title: "Unselected", url: "https://example.com/unselected", excerpts: ["Unselected excerpt"] },
    ];
    const response = (value: unknown) => ({
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: value,
      text: JSON.stringify(value),
    });
    const queue = () => {
      request.mockResolvedValueOnce(response({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } }));
      request.mockResolvedValueOnce(response({}));
      request.mockResolvedValueOnce(
        response({ jsonrpc: "2.0", id: 2, result: { structuredContent: { results: sources } } })
      );
    };
    queue();
    const results = await service.handleToolCalls(calls);
    expect(resolveCredential).not.toHaveBeenCalled();
    expect(JSON.stringify(request.mock.calls)).toContain("approved public query");
    expect(JSON.stringify(request.mock.calls)).not.toContain("original query");
    approval.approveWebResults.mockImplementation(async (_query, results) => ({
      approved: true,
      approvedResults: results.slice(0, 1),
    }));
    const processed = await service.processToolResults(calls, results);
    expect(processed.contextMessages[0].content).toContain(sources[0].url);
    expect(JSON.stringify(processed)).not.toContain("Unselected");
    approval.approveWebResults.mockResolvedValue({ approved: false, approvedResults: [] });
    const rejected = await service.processToolResults(calls, results);
    expect(JSON.stringify(rejected)).not.toContain("Selected excerpt");
    expect(rejected.contextMessages[0].content).toContain("no results selected");
  });

  it("requests approvals sequentially", async () => {
    let activeApprovals = 0;
    let maxActiveApprovals = 0;
    const approval = createApprovalGateway({ approved: true, approvalId: "approval" });
    approval.approveTool = jest.fn(async (request) => {
      activeApprovals++;
      maxActiveApprovals = Math.max(maxActiveApprovals, activeApprovals);
      await Promise.resolve();
      activeApprovals--;
      return { approved: true, approvalId: request.toolCallId };
    });
    const service = createService(approval);
    service.registerTool("test_tool", {
      description: "test",
      inputSchema: z.object({}),
      execute: async () => "ok",
    });

    await service.handleToolCalls([
      { toolCallId: "1", toolName: "test_tool", input: {} },
      { toolCallId: "2", toolName: "test_tool", input: {} },
    ]);

    expect(maxActiveApprovals).toBe(1);
  });
});

function createApprovalGateway(decision: {
  approved: boolean;
  approvalId: string;
  modifiedArgs?: Record<string, unknown>;
}): jest.Mocked<ToolApprovalGateway> {
  return {
    approveTool: jest.fn(async () => decision),
    approveVaultResults: jest.fn(async (_query, results) => ({ approved: true, approvedResults: results })),
    approveWebResults: jest.fn(async (_query, results) => ({ approved: true, approvedResults: results })),
  };
}

function createService(approval: ToolApprovalGateway): ToolService {
  return new ToolService(
    {} as never,
    {} as never,
    { showWarning: jest.fn() } as never,
    {
      enableToolCalling: true,
      webSearchProvider: "brave",
      webSearchApiKey: "",
      webSearchApiUrl: "",
    } as never,
    undefined,
    undefined,
    approval
  );
}
