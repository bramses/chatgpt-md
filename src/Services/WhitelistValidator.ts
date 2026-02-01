/**
 * Whitelist Validation Service
 *
 * Validates configured models against the tool whitelist and provides
 * match statistics and suggestions for better user experience.
 */

import { isModelWhitelisted } from "./ToolSupportDetector";

export interface WhitelistValidationResult {
  /** Total number of configured models checked */
  totalModels: number;
  /** Number of models that match whitelist patterns */
  matchedModels: number;
  /** Number of models that don't match any whitelist pattern */
  unmatchedModels: number;
  /** Percentage of configured models that support tools */
  matchRate: number;
  /** List of model IDs that matched the whitelist */
  matchedModelIds: string[];
  /** List of model IDs that didn't match, with suggestions */
  unmatchedModelDetails: UnmatchedModelDetail[];
}

export interface UnmatchedModelDetail {
  /** The model ID that didn't match */
  modelId: string;
  /** Suggested similar models from whitelist that support tools */
  suggestions: string[];
  /** Reason why it might not be on whitelist */
  possibleReason: string;
}

/**
 * Validate configured models against the whitelist
 *
 * @param configuredModels - Array of model IDs to check
 * @param whitelist - The whitelist patterns to match against
 * @returns Validation result with statistics and suggestions
 */
export function validateWhitelist(
  configuredModels: string[],
  whitelist: string
): WhitelistValidationResult {
  const matchedModelIds: string[] = [];
  const unmatchedModelDetails: UnmatchedModelDetail[] = [];

  for (const modelId of configuredModels) {
    if (isModelWhitelisted(modelId, whitelist)) {
      matchedModelIds.push(modelId);
    } else {
      const suggestions = generateSuggestions(modelId, whitelist);
      const possibleReason = determinePossibleReason(modelId, whitelist);
      unmatchedModelDetails.push({
        modelId,
        suggestions,
        possibleReason,
      });
    }
  }

  const totalModels = configuredModels.length;
  const matchedModels = matchedModelIds.length;
  const unmatchedModels = unmatchedModelDetails.length;
  const matchRate = totalModels > 0 ? (matchedModels / totalModels) * 100 : 0;

  return {
    totalModels,
    matchedModels,
    unmatchedModels,
    matchRate,
    matchedModelIds,
    unmatchedModelDetails,
  };
}

/**
 * Generate suggestions for similar models in the whitelist
 */
function generateSuggestions(modelId: string, whitelist: string): string[] {
  const suggestions: string[] = [];
  const modelName = modelId.split("@").pop() || modelId; // Remove provider prefix if present
  const patterns = whitelist
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  // Extract base model name (remove date suffixes, versions)
  const baseName = modelName
    .replace(/-\d{4}-\d{2}-\d{2}$/, "") // Remove date suffix
    .replace(/-\d{8}$/, "") // Remove compact date suffix
    .replace(/-(preview|latest|mini|pro|nano|turbo)$/i, ""); // Remove common suffixes

  // Find patterns that start with or contain the base name
  for (const pattern of patterns) {
    if (
      pattern.startsWith(baseName) ||
      baseName.startsWith(pattern.replace(/[*]$/, "")) ||
      pattern.includes(baseName)
    ) {
      if (pattern !== modelName && !suggestions.includes(pattern)) {
        suggestions.push(pattern);
      }
    }
  }

  // Limit to top 3 suggestions
  return suggestions.slice(0, 3);
}

/**
 * Determine possible reason why a model isn't on the whitelist
 */
function determinePossibleReason(modelId: string, whitelist: string): string {
  const modelName = modelId.split("@").pop() || modelId;

  // Check if it's a newer model that might not be tested yet
  const dateMatch = modelName.match(/(\d{4})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1]);
    if (year >= 2025) {
      return "Recent model - may not have been tested yet for tool support";
    }
  }

  // Check if it's a local model (Ollama, LM Studio)
  const lowerName = modelName.toLowerCase();
  if (lowerName.includes("llama") || lowerName.includes("mistral") || lowerName.includes("qwen")) {
    return "Local model - tool support may vary by implementation";
  }

  // Check if it's an older model
  const olderModels = ["gpt-3", "gpt-3.5", "claude-2", "claude-3"];
  if (olderModels.some((old) => lowerName.startsWith(old))) {
    return "Older model - may not support advanced tool calling features";
  }

  return "Model not confirmed to support tools in testing";
}

/**
 * Format validation result as human-readable text
 */
export function formatValidationResult(result: WhitelistValidationResult): string {
  const lines: string[] = [];

  lines.push(`Tool Support Summary:`);
  lines.push(`  ${result.matchedModels} of ${result.totalModels} models support tools (${result.matchRate.toFixed(0)}%)`);

  if (result.unmatchedModelDetails.length > 0) {
    lines.push(``);
    lines.push(`Models without tool support (${result.unmatchedModels}):`);
    for (const detail of result.unmatchedModelDetails) {
      lines.push(`  • ${detail.modelId}`);
      if (detail.possibleReason) {
        lines.push(`    ${detail.possibleReason}`);
      }
      if (detail.suggestions.length > 0) {
        lines.push(`    Similar tool-enabled models: ${detail.suggestions.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}
