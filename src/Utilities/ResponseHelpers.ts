import { Editor } from "obsidian";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  ROLE_ASSISTANT,
  TRUNCATION_ERROR_FULL,
  TRUNCATION_ERROR_PARTIAL,
} from "src/Constants";
import { getHeaderRole } from "src/Utilities/TextHelpers";

/**
 * Utility functions for handling API responses
 * These are simple, stateless functions that can be used anywhere
 */

/**
 * Insert the assistant header at the current cursor position
 * Returns the initial and new cursor positions for tracking
 */
export function insertAssistantHeader(
  editor: Editor,
  headingPrefix: string,
  model: string
): {
  initialCursor: { line: number; ch: number };
  newCursor: { line: number; ch: number };
} {
  const newLine = getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
  const initialCursor = editor.getCursor();

  editor.replaceRange(newLine, initialCursor);

  // Calculate new cursor position using Obsidian's offset API
  const initialOffset = editor.posToOffset(initialCursor);
  const newCursor = editor.offsetToPos(initialOffset + newLine.length);

  editor.setCursor(newCursor);

  return { initialCursor, newCursor };
}

/**
 * Handle choices with finish_reason validation
 * Returns appropriate content based on whether responses were truncated
 */
export function handleChoicesWithFinishReason(choices: any[]): string | null {
  if (!choices || choices.length === 0) {
    return null;
  }

  const completeChoices = choices.filter((choice: any) => choice.finish_reason === "stop");
  const truncatedChoices = choices.filter((choice: any) => choice.finish_reason === "length");

  // If we have complete responses, use the first one
  if (completeChoices.length > 0) {
    const content = completeChoices[0].message?.content || "";
    // If some choices were truncated, add a warning
    if (truncatedChoices.length > 0) {
      return content + "\n\n" + TRUNCATION_ERROR_PARTIAL;
    }
    // All responses were complete
    return content;
  }

  // All choices were truncated
  if (truncatedChoices.length > 0) {
    return TRUNCATION_ERROR_FULL;
  }

  // Fallback to first choice if no specific finish_reason handling
  return choices[0].message?.content || "";
}

/**
 * Parse Anthropic's response format
 */
export function parseAnthropicResponse(data: any): string {
  if (data.content && Array.isArray(data.content)) {
    // Extract text content from the content array
    return data.content
      .filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join("");
  }
  return data.content || JSON.stringify(data);
}

/**
 * Parse Gemini's response format
 */
export function parseGeminiResponse(data: any): string {
  if (data.candidates && data.candidates.length > 0) {
    const candidate = data.candidates[0];
    if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
      return candidate.content.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text)
        .join("");
    }
  }
  return data.text || JSON.stringify(data);
}

/**
 * Parse Ollama's response format
 */
export function parseOllamaResponse(data: any): string {
  // Check for Ollama's chat API format which has a message object with content
  if (data.message && data.message.content) {
    return data.message.content;
  }
  // Check for Ollama's generate API format which has a response field
  if (data.response) {
    return data.response;
  }
  // Fallback to stringifying the data
  return JSON.stringify(data);
}

/**
 * Parse a non-streaming API response based on service type
 */
export function parseNonStreamingResponse(data: any, serviceType: string): string {
  switch (serviceType) {
    case AI_SERVICE_OPENAI:
    case AI_SERVICE_OPENROUTER:
    case AI_SERVICE_LMSTUDIO:
      // Handle OpenAI-compatible services with finish_reason validation
      const result = handleChoicesWithFinishReason(data.choices);
      return result !== null ? result : "";
    case AI_SERVICE_ANTHROPIC:
      return parseAnthropicResponse(data);
    case AI_SERVICE_GEMINI:
      return parseGeminiResponse(data);
    case AI_SERVICE_OLLAMA:
      return parseOllamaResponse(data);
    default:
      console.warn(`Unknown service type: ${serviceType}`);
      // Check for OpenAI-like structure with finish_reason validation
      const defaultResult = handleChoicesWithFinishReason(data?.choices);
      if (defaultResult !== null) {
        return defaultResult;
      }
      return data?.response || JSON.stringify(data);
  }
}
