#!/usr/bin/env node

/**
 * Test All Models for Tool Support
 *
 * Comprehensive testing script that tests ALL available models for tool calling support.
 * This is more thorough than test-models-tools.mjs but takes longer and costs more.
 *
 * Usage:
 *   node scripts/tool-whitelist/test-all-models-tool-support.mjs [--provider name] [--concurrent N]
 *
 * Options:
 *   --provider name   Test only specific provider (openai|anthropic|gemini|openrouter)
 *   --concurrent N    Number of concurrent tests (default: 3)
 *
 * Prerequisites:
 *   1. Run fetch-available-models.mjs first
 *   2. Ensure data.json has valid API keys
 *   3. Be prepared for API costs and time investment
 *
 * Output:
 *   scripts/tool-whitelist/tool-test-results.json
 *
 * Warning: This can be expensive and time-consuming!
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, tool, zodSchema } from "ai";
import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const providerIndex = args.indexOf("--provider");
const PROVIDER_FILTER = providerIndex !== -1 ? args[providerIndex + 1] : null;
const concurrentIndex = args.indexOf("--concurrent");
const CONCURRENT = concurrentIndex !== -1 ? parseInt(args[concurrentIndex + 1]) : 3;

// Load configuration
function loadConfig() {
  try {
    const dataPath = join(__dirname, "..", "..", "data.json");
    const data = JSON.parse(readFileSync(dataPath, "utf8"));
    return {
      openai: data.apiKey,
      anthropic: data.anthropicApiKey,
      gemini: data.geminiApiKey,
      openrouter: data.openrouterApiKey,
    };
  } catch (error) {
    console.error("❌ Error loading data.json:", error.message);
    process.exit(1);
  }
}

// Load available models
function loadAvailableModels() {
  try {
    const modelsPath = join(__dirname, "available-models.json");
    return JSON.parse(readFileSync(modelsPath, "utf8"));
  } catch (error) {
    console.error("❌ Error loading available-models.json:", error.message);
    console.error("   Run fetch-available-models.mjs first");
    process.exit(1);
  }
}

const apiKeys = loadConfig();
const availableModels = loadAvailableModels();

// Test tool definition
const testTool = tool({
  description: "Get the current time in ISO format",
  inputSchema: zodSchema(
    z.object({
      timezone: z.string().optional().describe("Optional timezone"),
    })
  ),
  execute: async (args) => ({
    time: new Date().toISOString(),
    timezone: args.timezone || "UTC",
  }),
});

// Test a single model
async function testModel(modelInfo) {
  const { provider, id, fullId } = modelInfo;

  try {
    let providerInstance;

    if (provider === "openai") {
      providerInstance = createOpenAI({ apiKey: apiKeys.openai });
    } else if (provider === "anthropic") {
      providerInstance = createAnthropic({ apiKey: apiKeys.anthropic });
    } else if (provider === "gemini") {
      providerInstance = createGoogleGenerativeAI({ apiKey: apiKeys.gemini });
    } else if (provider === "openrouter") {
      providerInstance = createOpenRouter({ apiKey: apiKeys.openrouter });
    } else {
      return {
        fullId,
        provider,
        id,
        status: "skipped",
        supportsTools: false,
        error: "Unknown provider",
      };
    }

    const result = await generateText({
      model: providerInstance(id),
      messages: [
        {
          role: "user",
          content: "What time is it? Use the test_tool function.",
        },
      ],
      tools: {
        test_tool: testTool,
      },
      maxToolRoundtrips: 2,
      temperature: 0,
    });

    const hasToolCalls = result.toolCalls && result.toolCalls.length > 0;

    return {
      fullId,
      provider,
      id,
      status: "success",
      supportsTools: hasToolCalls,
      response: {
        text: result.text || "",
        toolCalls: result.toolCalls?.length || 0,
      },
    };
  } catch (error) {
    return {
      fullId,
      provider,
      id,
      status: "error",
      supportsTools: false,
      error: error.message,
      errorType: error.name,
    };
  }
}

// Process models in batches
async function processInBatch(models, batchSize) {
  const results = [];
  for (let i = 0; i < models.length; i += batchSize) {
    const batch = models.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(testModel));
    results.push(...batchResults);

    // Progress update
    const processed = Math.min(i + batchSize, models.length);
    console.log(`   Progress: ${processed}/${models.length} models tested`);
  }
  return results;
}

// Main execution
async function main() {
  console.log("🧪 Testing all models for tool support\n");

  // Collect all models to test
  const modelsToTest = [];
  const providers = availableModels.providers || {};

  for (const [providerName, providerData] of Object.entries(providers)) {
    if (PROVIDER_FILTER && providerName !== PROVIDER_FILTER) {
      continue;
    }

    const models = providerData.models || [];
    console.log(`📦 ${providerName}: ${models.length} models`);

    for (const model of models) {
      modelsToTest.push({
        provider: providerName,
        id: model.id,
        fullId: `${providerName}@${model.id}`,
      });
    }
  }

  console.log(`\n🔬 Testing ${modelsToTest.length} models...\n`);

  // Test models with concurrency control
  const results = await processInBatch(modelsToTest, CONCURRENT);

  // Calculate statistics
  const successful = results.filter((r) => r.status === "success");
  const errors = results.filter((r) => r.status === "error");
  const toolSupport = results.filter((r) => r.supportsTools);

  console.log("\n📊 Results:");
  console.log(`   Total tested: ${results.length}`);
  console.log(`   Successful: ${successful.length} (${((successful.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Errors: ${errors.length} (${((errors.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Tool support: ${toolSupport.length} (${((toolSupport.length / results.length) * 100).toFixed(1)}%)`);

  // Group by provider
  const byProvider = {};
  results.forEach((result) => {
    if (!byProvider[result.provider]) {
      byProvider[result.provider] = { total: 0, supportsTools: 0, errors: 0 };
    }
    byProvider[result.provider].total++;
    if (result.supportsTools) byProvider[result.provider].supportsTools++;
    if (result.status === "error") byProvider[result.provider].errors++;
  });

  console.log("\n📈 By Provider:");
  for (const [provider, stats] of Object.entries(byProvider)) {
    console.log(`   ${provider}:`);
    console.log(`     Total: ${stats.total}`);
    console.log(
      `     Tool support: ${stats.supportsTools} (${((stats.supportsTools / stats.total) * 100).toFixed(1)}%)`
    );
    console.log(`     Errors: ${stats.errors} (${((stats.errors / stats.total) * 100).toFixed(1)}%)`);
  }

  // Write results
  const outputPath = join(__dirname, "tool-test-results.json");
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        configuration: {
          limit: null,
          providerFilter: PROVIDER_FILTER,
          concurrent: CONCURRENT,
        },
        summary: {
          totalTested: results.length,
          successful: successful.length,
          errors: errors.length,
          supportsTools: toolSupport.length,
          byProvider,
        },
        models: results,
      },
      null,
      2
    )
  );

  console.log(`\n✅ Results written to: ${outputPath}`);
}

main().catch(console.error);
