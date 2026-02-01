/**
 * Type declarations for @github/copilot-sdk
 * Based on official documentation from github/awesome-copilot (2026)
 */
declare module "@github/copilot-sdk" {
  // Client configuration
  export interface CopilotClientOptions {
    /** Path to the Copilot CLI executable */
    cliPath?: string;
    /** URL to connect to existing CLI server */
    cliUrl?: string;
    /** Port for CLI server (0 = random) */
    port?: number;
    /** Use stdio transport */
    useStdio?: boolean;
    /** Auto-start server */
    autoStart?: boolean;
    /** Auto-restart on crash */
    autoRestart?: boolean;
    /** Log level */
    logLevel?: "debug" | "info" | "warn" | "error";
    /** Working directory for CLI process */
    cwd?: string;
    /** Environment variables for CLI process */
    env?: Record<string, string>;
  }

  // System message configuration
  export interface SystemMessageConfig {
    /** Mode: "append" preserves guardrails, "replace" removes them */
    mode: "append" | "replace";
    /** The system message content */
    content: string;
  }

  // Session configuration
  export interface SessionOptions {
    /** Model to use (e.g., "gpt-4.1", "gpt-5", "claude-sonnet-4") */
    model?: string;
    /** Enable streaming delta events */
    streaming?: boolean;
    /** Custom tools */
    tools?: ToolDefinition[];
    /** System message customization */
    systemMessage?: SystemMessageConfig;
    /** Allowlist of tools */
    availableTools?: string[];
    /** Blocklist of tools */
    excludedTools?: string[];
  }

  // File attachment
  export interface FileAttachment {
    type: "file";
    path: string;
    displayName?: string;
  }

  // Send options
  export interface SendOptions {
    /** The prompt to send */
    prompt: string;
    /** File attachments */
    attachments?: FileAttachment[];
  }

  // Event types (discriminated union)
  export interface UserMessageEvent {
    type: "user.message";
    data: { content: string };
  }

  export interface AssistantMessageEvent {
    type: "assistant.message";
    data: { content: string };
  }

  export interface AssistantMessageDeltaEvent {
    type: "assistant.message.delta";
    data: { deltaContent: string };
  }

  export interface AssistantReasoningDeltaEvent {
    type: "assistant.reasoning.delta";
    data: { deltaContent: string };
  }

  export interface SessionStartEvent {
    type: "session.start";
    data: Record<string, unknown>;
  }

  export interface SessionIdleEvent {
    type: "session.idle";
    data: Record<string, unknown>;
  }

  export interface SessionErrorEvent {
    type: "session.error";
    data: { message: string };
  }

  export interface ToolExecutionStartEvent {
    type: "tool.executionStart";
    data: { toolName: string; args: Record<string, unknown> };
  }

  export interface ToolExecutionCompleteEvent {
    type: "tool.executionComplete";
    data: { toolName: string; result: unknown };
  }

  export type SessionEvent =
    | UserMessageEvent
    | AssistantMessageEvent
    | AssistantMessageDeltaEvent
    | AssistantReasoningDeltaEvent
    | SessionStartEvent
    | SessionIdleEvent
    | SessionErrorEvent
    | ToolExecutionStartEvent
    | ToolExecutionCompleteEvent;

  // Tool result object
  export interface ToolResultObject {
    textResultForLlm: string;
    resultType: "success" | "failure";
    error?: string;
    toolTelemetry?: Record<string, unknown>;
  }

  // Tool definition (simplified without zod dependency in types)
  export interface ToolDefinition {
    name: string;
    description: string;
    parameters: unknown;
    handler: (args: unknown) => Promise<unknown | ToolResultObject>;
  }

  // Session interface
  export interface CopilotSession {
    /** Session identifier */
    sessionId: string;

    /**
     * Send a prompt (returns Promise<string> of response)
     */
    send(options: SendOptions): Promise<string>;

    /**
     * Send a prompt and wait for session.idle
     */
    sendAndWait(options: SendOptions, timeout?: number): Promise<string>;

    /**
     * Subscribe to events. Returns unsubscribe function.
     */
    on(handler: (event: SessionEvent) => void): () => void;

    /**
     * Abort current processing
     */
    abort(): Promise<void>;

    /**
     * Get all messages/events
     */
    getMessages(): Promise<SessionEvent[]>;

    /**
     * Clean up session resources
     */
    destroy(): Promise<void>;
  }

  // Client state
  export type ClientState = "disconnected" | "connecting" | "connected" | "error";

  // Main client class
  export class CopilotClient {
    constructor(options?: CopilotClientOptions);

    /**
     * Start the client (must be called before createSession)
     */
    start(): Promise<void>;

    /**
     * Stop the client and cleanup resources
     */
    stop(): Promise<void>;

    /**
     * Get current client state
     */
    getState(): ClientState;

    /**
     * Create a new chat session
     */
    createSession(options?: SessionOptions): Promise<CopilotSession>;

    /**
     * Resume an existing session
     */
    resumeSession(sessionId: string, options?: Partial<SessionOptions>): Promise<CopilotSession>;

    /**
     * List all sessions
     */
    listSessions(): Promise<string[]>;

    /**
     * Get the last session ID
     */
    getLastSessionId(): Promise<string | null>;

    /**
     * Delete a session
     */
    deleteSession(sessionId: string): Promise<void>;
  }

  /**
   * Helper to define type-safe tools (requires zod at runtime)
   */
  export function defineTool(config: ToolDefinition): ToolDefinition;
}
