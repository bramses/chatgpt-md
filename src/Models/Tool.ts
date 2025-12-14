import { App, TFile } from "obsidian";

/**
 * Tool execution context with Obsidian-specific information
 */
export interface ToolExecutionContext {
  app: App;
  toolCallId: string;
  messages: any[];
  abortSignal?: AbortSignal;
}

/**
 * Tool approval request from AI SDK
 */
export interface ToolApprovalRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

/**
 * User's approval decision for a tool call
 */
export interface ToolApprovalDecision {
  approvalId: string;
  approved: boolean;
  modifiedArgs?: Record<string, any>; // Allow user to modify args before execution
}

/**
 * Result from vault search tool
 */
export interface VaultSearchResult {
  path: string;
  basename: string;
  matches: number;
  preview: string;
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
