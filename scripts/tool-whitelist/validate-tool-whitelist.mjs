#!/usr/bin/env node

/**
 * Validate tool whitelist against known tool-supporting models
 *
 * This script validates the default whitelist WITHOUT making API calls.
 * It checks against known model patterns that support tools based on
 * official documentation.
 *
 * Usage:
 *   node scripts/validate-tool-whitelist.mjs
 */

// Default whitelist (copied from ToolSupportDetector.ts)
const DEFAULT_WHITELIST = `# OpenAI - GPT-5.2
gpt-5.2
gpt-5.2-chat-latest
gpt-5.2-pro

# OpenAI - o-series
o1
o3
o3-mini
o3-pro
o4-mini

# Anthropic - Claude 4.5
claude-opus-4-5
claude-haiku-4-5
claude-sonnet-4-5

# Gemini - Flash models
gemini-2.5-flash
gemini-2.5-flash-lite
gemini-flash-latest
gemini-flash-lite-latest
gemini-3-flash-preview`;

// Known tool-supporting model patterns from official documentation
const KNOWN_TOOL_SUPPORT = {
  openai: {
    patterns: [
      /^gpt-4/, // GPT-4 and variants
      /^gpt-5/, // GPT-5 series (assumed future)
      /^o1/, // o1 series (reasoning models)
      /^o3/, // o3 series
      /^o4/, // o4 series (assumed future)
    ],
    notes: "OpenAI models gpt-4+, o-series support function calling",
    docsUrl: "https://platform.openai.com/docs/guides/function-calling",
  },
  anthropic: {
    patterns: [
      /^claude-3/, // Claude 3 (Opus, Sonnet, Haiku)
      /^claude-opus-4/, // Claude Opus 4
      /^claude-sonnet-4/, // Claude Sonnet 4
      /^claude-haiku-4/, // Claude Haiku 4
    ],
    notes: "Claude 3+ models support tool use",
    docsUrl: "https://docs.anthropic.com/en/docs/tool-use",
  },
  gemini: {
    patterns: [
      /^gemini-.*-flash/, // Flash models (e.g., gemini-2.5-flash)
      /^gemini-flash-/, // Flash latest variants (e.g., gemini-flash-latest)
      /^gemini-pro/, // Pro models
      /^gemini-1\.5/, // Gemini 1.5+
      /^gemini-2/, // Gemini 2.0+
      /^gemini-3/, // Gemini 3.0 (assumed future)
    ],
    notes: "Gemini 1.5+, Flash models support function calling",
    docsUrl: "https://ai.google.dev/gemini-api/docs/function-calling",
  },
};

// Parse whitelist
function parseWhitelist(whitelist) {
  return whitelist
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

// Determine provider from model name
function getProvider(modelName) {
  if (modelName.startsWith("gpt-") || modelName.startsWith("o")) {
    return "openai";
  }
  if (modelName.startsWith("claude-")) {
    return "anthropic";
  }
  if (modelName.startsWith("gemini-")) {
    return "gemini";
  }
  return "unknown";
}

// Check if model matches known tool-supporting patterns
function validateModel(modelName) {
  const provider = getProvider(modelName);

  if (provider === "unknown") {
    return {
      model: modelName,
      provider,
      valid: false,
      confidence: "unknown",
      reason: "Unknown provider",
    };
  }

  const providerInfo = KNOWN_TOOL_SUPPORT[provider];
  const matchesPattern = providerInfo.patterns.some((pattern) => pattern.test(modelName));

  if (matchesPattern) {
    return {
      model: modelName,
      provider,
      valid: true,
      confidence: "high",
      reason: providerInfo.notes,
      docsUrl: providerInfo.docsUrl,
    };
  }

  return {
    model: modelName,
    provider,
    valid: false,
    confidence: "low",
    reason: `Does not match known tool-supporting patterns for ${provider}`,
    docsUrl: providerInfo.docsUrl,
  };
}

// Main validator
function main() {
  console.log("🔍 Validating Tool Whitelist\n");
  console.log("=".repeat(80));
  console.log();

  const models = parseWhitelist(DEFAULT_WHITELIST);
  console.log(`Validating ${models.length} whitelisted models...\n`);

  const results = models.map(validateModel);

  // Print results
  results.forEach((r) => {
    const status = r.valid ? "✅" : "❌";
    const confidence = r.valid ? `(${r.confidence} confidence)` : "";
    console.log(`${status} ${r.model.padEnd(30)} ${r.provider.padEnd(10)} ${confidence}`);

    if (!r.valid) {
      console.log(`   ⚠️  ${r.reason}`);
    }
  });

  // Summary
  console.log();
  console.log("=".repeat(80));
  console.log("\n📊 SUMMARY\n");

  const valid = results.filter((r) => r.valid).length;
  const invalid = results.filter((r) => !r.valid).length;

  console.log(`Total models: ${results.length}`);
  console.log(`  ✅ Valid (likely support tools): ${valid}`);
  console.log(`  ❌ Invalid (uncertain/no support): ${invalid}`);

  // Group by provider
  console.log("\nBy provider:");
  const byProvider = results.reduce((acc, r) => {
    if (!acc[r.provider]) {
      acc[r.provider] = { valid: 0, invalid: 0 };
    }
    if (r.valid) {
      acc[r.provider].valid++;
    } else {
      acc[r.provider].invalid++;
    }
    return acc;
  }, {});

  Object.entries(byProvider).forEach(([provider, counts]) => {
    console.log(`  ${provider}: ${counts.valid} valid, ${counts.invalid} invalid`);
  });

  // Show invalid models
  const invalidModels = results.filter((r) => !r.valid);
  if (invalidModels.length > 0) {
    console.log("\n⚠️  MODELS WITH UNCERTAIN TOOL SUPPORT:\n");
    invalidModels.forEach((m) => {
      console.log(`  ${m.model} (${m.provider})`);
      console.log(`    Reason: ${m.reason}`);
      if (m.docsUrl) {
        console.log(`    Docs: ${m.docsUrl}`);
      }
    });
  }

  // Show documentation links
  console.log("\n📚 DOCUMENTATION REFERENCES:\n");
  Object.entries(KNOWN_TOOL_SUPPORT).forEach(([provider, info]) => {
    console.log(`  ${provider}: ${info.docsUrl}`);
  });

  console.log();

  // Exit with error if any invalid
  if (invalid > 0) {
    console.log("⚠️  Warning: Some models may not support tools. Review the list above.");
    process.exit(1);
  } else {
    console.log("✅ All whitelisted models are likely to support tools!");
    process.exit(0);
  }
}

main();
