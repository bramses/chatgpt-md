import { App, TFile } from "obsidian";
import { z } from "zod";
import { Message } from "./Message";

/**
 * Tool execution context with Obsidian-specific information
 */
export interface ToolExecutionContext {
  app: App;
  toolCallId: string;
  messages: Message[];
  abortSignal?: AbortSignal;
}

/**
 * Tool approval request from AI SDK
 */
export interface ToolApprovalRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  modelName?: string;
}

/**
 * Tool call from AI SDK
 */
export interface AiToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  toolCallId: string;
  result: unknown;
}

/**
 * Tool definition for registration
 */
export interface RegisteredTool {
  description: string;
  inputSchema: z.ZodSchema;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
}

/**
 * Result handlers
 */
export type ToolResultHandler = (
  result: ToolExecutionResult,
  toolCall: AiToolCall,
  filteredResults: ToolExecutionResult[],
  contextMessages: Array<{ role: "user"; content: string }>,
  modelName?: string
) => Promise<void>;

/**
 * User's approval decision for a tool call
 */
export interface ToolApprovalDecision {
  approvalId: string;
  approved: boolean;
  modifiedArgs?: Record<string, unknown>; // Allow user to modify args before execution
}

/**
 * Result from vault search tool
 */
export interface VaultSearchResult {
  path: string;
  basename: string;
  matches: number;
  preview?: string; // Optional: file preview (removed for privacy - use file_read for full content)
}

/**
 * File selection for reading
 */
export interface FileSelection {
  file: TFile;
  selected: boolean;
  reason: string;
}

/**
 * Result from file read tool
 */
export interface FileReadResult {
  path: string;
  content: string;
  size: number;
}

/**
 * Request to approve search results before showing to LLM
 */
export interface SearchResultsApprovalRequest {
  query: string;
  results: VaultSearchResult[];
}

/**
 * User's decision on which search results to share with LLM
 */
export interface SearchResultsApprovalDecision {
  approved: boolean;
  approvedResults: VaultSearchResult[]; // Only the approved results
}

/**
 * Web search result from search API
 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string; // Full page content if fetched
}

/**
 * Web search approval request
 */
export interface WebSearchApprovalRequest {
  query: string;
  results: WebSearchResult[];
}

/**
 * User's web search approval decision
 */
export interface WebSearchApprovalDecision {
  approved: boolean;
  approvedResults: WebSearchResult[];
}
