#!/usr/bin/env node

/**
 * Generate Tool Whitelist
 *
 * Reads tool-test-results.json and generates a new default whitelist
 * containing only models that successfully support tool calling.
 *
 * Usage:
 *   node scripts/generate-whitelist.mjs [--min-success-rate N] [--output path]
 *
 * Options:
 *   --min-success-rate N   Minimum success rate (0-1) to include (default: 1.0 = 100%)
 *   --output path          Output file path (default: scripts/generated-whitelist.txt)
 *
 * Prerequisites:
 *   1. Run fetch-available-models.mjs
 *   2. Run test-models-tools.mjs
 *
 * Output:
 *   scripts/generated-whitelist.txt (or custom path)
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const minRateIndex = args.indexOf("--min-success-rate");
const MIN_SUCCESS_RATE = minRateIndex !== -1 ? parseFloat(args[minRateIndex + 1]) : 1.0;
const outputIndex = args.indexOf("--output");
const OUTPUT_PATH = outputIndex !== -1 ? args[outputIndex + 1] : join(__dirname, "generated-whitelist.txt");

// Load test results
function loadTestResults() {
  try {
    const resultsPath = join(__dirname, "tool-test-results.json");
    return JSON.parse(readFileSync(resultsPath, "utf8"));
  } catch (error) {
    console.error("❌ Error loading tool-test-results.json:", error.message);
    console.error("   Run test-models-tools.mjs first");
    process.exit(1);
  }
}

const testResults = loadTestResults();

// Group models by base pattern
function getBasePattern(modelId) {
  // Remove date suffixes
  let base = modelId.replace(/-\d{8}$/, ""); // -YYYYMMDD
  base = base.replace(/-\d{4}-\d{2}-\d{2}$/, ""); // -YYYY-MM-DD

  // For versioned models, keep the version
  // e.g., "gpt-5.2" stays "gpt-5.2"
  // e.g., "o3-mini" stays "o3-mini"
  return base;
}

// Group models by provider and pattern
function groupModels(models) {
  const groups = {};

  for (const model of models) {
    if (!model.supportsTools) continue;

    const { provider, id } = model;
    const basePattern = getBasePattern(id);

    if (!groups[provider]) {
      groups[provider] = {};
    }

    if (!groups[provider][basePattern]) {
      groups[provider][basePattern] = {
        pattern: basePattern,
        models: [],
        successCount: 0,
        totalCount: 0,
      };
    }

    const group = groups[provider][basePattern];
    group.models.push(model);
    group.totalCount++;
    if (model.supportsTools) {
      group.successCount++;
    }
  }

  return groups;
}

// Generate whitelist content
function generateWhitelist(groups) {
  const lines = [];
  const stats = {
    totalPatterns: 0,
    byProvider: {},
  };

  // Provider display names and order
  const providerConfig = {
    openai: { name: "OpenAI", order: 1 },
    anthropic: { name: "Anthropic", order: 2 },
    gemini: { name: "Gemini", order: 3 },
    openrouter: { name: "OpenRouter", order: 4 },
  };

  // Sort providers
  const sortedProviders = Object.keys(groups).sort((a, b) => {
    const orderA = providerConfig[a]?.order || 999;
    const orderB = providerConfig[b]?.order || 999;
    return orderA - orderB;
  });

  for (const provider of sortedProviders) {
    const providerGroups = groups[provider];
    const providerName = providerConfig[provider]?.name || provider;

    // Sort patterns alphabetically
    const sortedPatterns = Object.keys(providerGroups).sort();

    if (sortedPatterns.length === 0) continue;

    lines.push(`# ${providerName}`);

    let providerCount = 0;
    for (const pattern of sortedPatterns) {
      const group = providerGroups[pattern];
      const successRate = group.successCount / group.totalCount;

      if (successRate >= MIN_SUCCESS_RATE) {
        lines.push(pattern);
        providerCount++;
        stats.totalPatterns++;
      }
    }

    stats.byProvider[provider] = providerCount;
    lines.push(""); // Empty line after each provider
  }

  return { content: lines.join("\n"), stats };
}

// Main
function main() {
  console.log("📝 Generating Tool Whitelist\n");
  console.log("=".repeat(80));
  console.log();

  console.log(`Configuration:`);
  console.log(`  Minimum success rate: ${(MIN_SUCCESS_RATE * 100).toFixed(0)}%`);
  console.log(`  Output: ${OUTPUT_PATH}`);
  console.log();

  // Filter models that support tools
  const toolSupportingModels = testResults.models.filter((m) => m.supportsTools);

  console.log(`Source data:`);
  console.log(`  Total models tested: ${testResults.summary.totalTested}`);
  console.log(`  Models with tool support: ${toolSupportingModels.length}`);
  console.log();

  // Group models
  const groups = groupModels(toolSupportingModels);

  // Generate whitelist
  const { content, stats } = generateWhitelist(groups);

  // Write to file
  writeFileSync(OUTPUT_PATH, content);

  console.log("=".repeat(80));
  console.log("\n📊 GENERATED WHITELIST\n");
  console.log(`Total patterns: ${stats.totalPatterns}`);
  Object.entries(stats.byProvider).forEach(([provider, count]) => {
    console.log(`  ${provider}: ${count} patterns`);
  });

  console.log(`\n✅ Whitelist written to: ${OUTPUT_PATH}\n`);

  // Show preview
  console.log("Preview (first 20 lines):");
  console.log("-".repeat(80));
  console.log(content.split("\n").slice(0, 20).join("\n"));
  if (content.split("\n").length > 20) {
    console.log("...");
  }
  console.log("-".repeat(80));
  console.log();

  // Show comparison with current whitelist
  try {
    const currentWhitelist = readFileSync(join(__dirname, "..", "src", "Services", "ToolSupportDetector.ts"), "utf8");
    const currentPatterns =
      currentWhitelist
        .match(/return `([^`]+)`/s)?.[1]
        ?.split(/[,\n]/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")) || [];

    const newPatterns = content
      .split(/[,\n]/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    console.log("📊 COMPARISON WITH CURRENT WHITELIST\n");
    console.log(`Current: ${currentPatterns.length} patterns`);
    console.log(`Generated: ${newPatterns.length} patterns`);
    console.log(
      `Difference: ${newPatterns.length - currentPatterns.length > 0 ? "+" : ""}${newPatterns.length - currentPatterns.length}`
    );
    console.log();

    // Find new patterns
    const newOnes = newPatterns.filter((p) => !currentPatterns.includes(p));
    if (newOnes.length > 0) {
      console.log(`New patterns (${newOnes.length}):`);
      newOnes.forEach((p) => console.log(`  + ${p}`));
      console.log();
    }

    // Find removed patterns
    const removed = currentPatterns.filter((p) => !newPatterns.includes(p));
    if (removed.length > 0) {
      console.log(`Removed patterns (${removed.length}):`);
      removed.forEach((p) => console.log(`  - ${p}`));
      console.log();
    }
  } catch (error) {
    // Ignore if can't read current whitelist
  }

  console.log("💡 NEXT STEPS:\n");
  console.log("1. Review the generated whitelist");
  console.log("2. Update src/Services/ToolSupportDetector.ts:getDefaultToolWhitelist()");
  console.log("3. Update src/Models/Config.ts:DEFAULT_SETTINGS.toolEnabledModels");
  console.log();
}

main();
