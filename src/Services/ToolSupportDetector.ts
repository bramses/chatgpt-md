/**
 * Minimal whitelist-based tool support detection
 *
 * Matching rules:
 * - Exact match: "o3" matches "o3"
 * - Date suffix match: "o3" matches "o3-2025-04-16" or "o3-20251101"
 * - Wildcard: "o3*" matches anything starting with "o3"
 */

import { getModelName } from "src/Utilities/ModelFilteringHelper";

/**
 * Check if a model matches any pattern in the whitelist
 */
export function isModelWhitelisted(modelId: string, whitelist: string): boolean {
  if (!whitelist || typeof whitelist !== "string") {
    return false;
  }

  const modelName = getModelName(modelId);
  const patterns = whitelist
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return patterns.some((pattern) => {
    // Wildcard matching
    if (pattern.endsWith("*")) {
      return modelName.startsWith(pattern.slice(0, -1));
    }

    // Exact match
    if (modelName === pattern) {
      return true;
    }

    // Date suffix match: "o3" matches "o3-20251101" or "o3-2025-04-16"
    if (modelName.startsWith(pattern)) {
      const suffix = modelName.slice(pattern.length);
      // Match -YYYYMMDD or -YYYY-MM-DD
      return /^-\d{8}$/.test(suffix) || /^-\d{4}-\d{2}-\d{2}$/.test(suffix);
    }

    return false;
  });
}

/**
 * Get the default whitelist value
 *
 * Generated from live API testing on 2026-02-01
 * Models tested: 503 | Tool support confirmed: 194 (38.6%)
 *
 * Pattern matching rules:
 * - Exact match: "o3" matches "o3"
 * - Date suffix match: "o3" matches "o3-2025-04-16" or "o3-20251101"
 * - Wildcard: "gpt-4*" matches anything starting with "gpt-4"
 *
 * For updates, see: scripts/tool-whitelist/README-WHITELIST-MAINTENANCE.md
 */
export function getDefaultToolWhitelist(): string {
  return `# Tool-Enabled Models Whitelist
# Generated: 2026-02-01 from live API testing
# Models tested: 503 | Tool support confirmed: 194 (38.6%)
#
# Pattern Matching:
#   - Exact match: "o3" matches "o3"
#   - Date suffix: "o3" matches "o3-2025-04-16" or "o3-20251101"
#   - Wildcard: "gpt-4*" matches anything starting with "gpt-4"
#   - Comments: Lines starting with # are ignored
#
# Last updated: See scripts/tool-whitelist/README-WHITELIST-MAINTENANCE.md

# OpenAI (36 patterns)
codex-mini-latest
gpt-3.5-turbo
gpt-3.5-turbo-0125
gpt-3.5-turbo-1106
gpt-4
gpt-4-0125-preview
gpt-4-0613
gpt-4-1106-preview
gpt-4-turbo
gpt-4-turbo-preview
gpt-4.1
gpt-4.1-mini
gpt-4.1-nano
gpt-4o
gpt-4o-mini
gpt-5
gpt-5-chat-latest
gpt-5-codex
gpt-5-mini
gpt-5-nano
gpt-5-pro
gpt-5.1
gpt-5.1-chat-latest
gpt-5.1-codex
gpt-5.1-codex-max
gpt-5.1-codex-mini
gpt-5.2
gpt-5.2-chat-latest
gpt-5.2-codex
gpt-5.2-pro
o1
o1-pro
o3
o3-mini
o3-pro
o4-mini

# Anthropic (9 patterns)
claude-3-5-haiku
claude-3-7-sonnet
claude-3-haiku
claude-haiku-4-5
claude-opus-4
claude-opus-4-1
claude-opus-4-5
claude-sonnet-4
claude-sonnet-4-5

# Gemini (7 patterns)
gemini-2.5-flash
gemini-2.5-flash-lite-preview-09-2025
gemini-2.5-flash-preview-09-2025
gemini-3-flash-preview
gemini-flash-latest
gemini-flash-lite-latest
gemini-robotics-er-1.5-preview

# OpenRouter (109 patterns)
ai21/jamba-mini-1.7
alibaba/tongyi-deepresearch-30b-a3b
allenai/olmo-3.1-32b-instruct
amazon/nova-lite-v1
amazon/nova-pro-v1
anthropic/claude-3-haiku
anthropic/claude-3.5-haiku
arcee-ai/trinity-large-preview:free
bytedance-seed/seed-1.6
bytedance-seed/seed-1.6-flash
cohere/command-r-08-2024
cohere/command-r-plus-08-2024
deepcogito/cogito-v2-preview-llama-109b-moe
deepcogito/cogito-v2-preview-llama-405b
deepcogito/cogito-v2-preview-llama-70b
deepseek/deepseek-chat
deepseek/deepseek-chat-v3-0324
deepseek/deepseek-chat-v3.1
deepseek/deepseek-r1
deepseek/deepseek-r1-0528
deepseek/deepseek-v3.1-terminus
deepseek/deepseek-v3.1-terminus:exacto
deepseek/deepseek-v3.2
deepseek/deepseek-v3.2-exp
google/gemini-2.0-flash-lite-001
inception/mercury
inception/mercury-coder
kwaipilot/kat-coder-pro
meta-llama/llama-3.1-405b-instruct
meta-llama/llama-3.1-70b-instruct
meta-llama/llama-4-maverick
meta-llama/llama-4-scout
minimax/minimax-m1
minimax/minimax-m2
minimax/minimax-m2.1
mistralai/codestral-2508
mistralai/devstral-2512
mistralai/devstral-small
mistralai/ministral-14b-2512
mistralai/ministral-3b
mistralai/ministral-3b-2512
mistralai/ministral-8b
mistralai/ministral-8b-2512
mistralai/mistral-large-2512
mistralai/mistral-nemo
mistralai/mistral-saba
mistralai/mistral-small-24b-instruct-2501
mistralai/mistral-small-creative
mistralai/mistral-tiny
mistralai/pixtral-12b
mistralai/voxtral-small-24b-2507
moonshotai/kimi-k2-0905
moonshotai/kimi-k2-0905:exacto
nex-agi/deepseek-v3.1-nex-n1
nvidia/llama-3.1-nemotron-70b-instruct
nvidia/llama-3.3-nemotron-super-49b-v1.5
nvidia/nemotron-3-nano-30b-a3b
nvidia/nemotron-3-nano-30b-a3b:free
nvidia/nemotron-nano-12b-v2-vl:free
nvidia/nemotron-nano-9b-v2
nvidia/nemotron-nano-9b-v2:free
openai/gpt-3.5-turbo
openai/gpt-3.5-turbo-0613
openai/gpt-3.5-turbo-16k
openai/gpt-4.1-mini
openai/gpt-4.1-nano
openai/gpt-4o
openai/gpt-4o-mini
openai/gpt-5-nano
openai/gpt-oss-120b
openai/gpt-oss-120b:exacto
openai/gpt-oss-20b
openai/gpt-oss-safeguard-20b
openrouter/auto
prime-intellect/intellect-3
qwen/qwen-2.5-72b-instruct
qwen/qwen-2.5-7b-instruct
qwen/qwen-max
qwen/qwen-plus
qwen/qwen-vl-max
qwen/qwen3-14b
qwen/qwen3-235b-a22b
qwen/qwen3-235b-a22b-thinking-2507
qwen/qwen3-30b-a3b
qwen/qwen3-30b-a3b-instruct-2507
qwen/qwen3-30b-a3b-thinking-2507
qwen/qwen3-32b
qwen/qwen3-8b
qwen/qwen3-coder
qwen/qwen3-coder-30b-a3b-instruct
qwen/qwen3-coder-flash
qwen/qwen3-coder:exacto
qwen/qwen3-next-80b-a3b-instruct
qwen/qwen3-next-80b-a3b-thinking
qwen/qwen3-vl-235b-a22b-instruct
qwen/qwen3-vl-30b-a3b-instruct
qwen/qwen3-vl-30b-a3b-thinking
qwen/qwen3-vl-8b-instruct
qwen/qwq-32b
stepfun-ai/step3
tngtech/deepseek-r1t2-chimera
tngtech/tng-r1t-chimera
tngtech/tng-r1t-chimera:free
upstage/solar-pro-3:free
x-ai/grok-3-mini
x-ai/grok-3-mini-beta
x-ai/grok-4-fast
x-ai/grok-4.1-fast
x-ai/grok-code-fast-1
xiaomi/mimo-v2-flash
z-ai/glm-4-32b
z-ai/glm-4.5
z-ai/glm-4.5-air
z-ai/glm-4.5-air:free
z-ai/glm-4.5v
z-ai/glm-4.6
z-ai/glm-4.6:exacto
z-ai/glm-4.6v
z-ai/glm-4.7
z-ai/glm-4.7-flash`;
}
