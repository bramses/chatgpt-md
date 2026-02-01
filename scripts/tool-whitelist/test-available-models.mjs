#!/usr/bin/env node

/**
 * Comprehensive Tool Support Testing
 *
 * This script:
 * 1. Fetches ALL currently available models from all providers (like the plugin does)
 * 2. Checks which models are whitelisted
 * 3. Tests a sample of whitelisted models with actual API calls
 * 4. Reports discrepancies and recommendations
 *
 * Usage:
 *   node scripts/test-available-models.mjs [--test-all]
 *
 * Options:
 *   --test-all    Test ALL whitelisted models (expensive, slow)
 *   (default)     Test only a sample from each provider
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, tool, zodSchema } from "ai";
import { z } from "zod";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ALL = process.argv.includes("--test-all");

// Load configuration from data.json
function loadConfig() {
  try {
    const dataPath = join(__dirname, "..", "data.json");
    const data = JSON.parse(readFileSync(dataPath, "utf8"));
    return {
      apiKeys: {
        openai: data.apiKey,
        openrouter: data.openrouterApiKey,
        anthropic: data.anthropicApiKey,
        gemini: data.geminiApiKey,
      },
      urls: {
        openai: data.openaiUrl,
        openrouter: data.openrouterUrl,
        ollama: data.ollamaUrl,
        lmstudio: data.lmstudioUrl,
        anthropic: data.anthropicUrl,
        gemini: data.geminiUrl,
      },
      whitelist: data.toolEnabledModels,
    };
  } catch (error) {
    console.error("❌ Error loading data.json:", error.message);
    process.exit(1);
  }
}

const config = loadConfig();

// Parse whitelist
function parseWhitelist(whitelist) {
  return whitelist
    .split(/[,\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

// Get model name without provider prefix
function getModelName(fullId) {
  if (fullId.includes("@")) {
    const parts = fullId.split("@");
    let modelId = parts[1];
    // Handle OpenRouter format "provider/model"
    if (modelId.includes("/")) {
      modelId = modelId.split("/")[1];
    }
    return modelId;
  }
  return fullId;
}

// Check if model matches whitelist
function isWhitelisted(modelId, whitelist) {
  const modelName = getModelName(modelId);
  const patterns = parseWhitelist(whitelist);

  return patterns.some((pattern) => {
    if (pattern.endsWith("*")) {
      return modelName.startsWith(pattern.slice(0, -1));
    }
    if (modelName === pattern) {
      return true;
    }
    // Date suffix match
    if (modelName.startsWith(pattern)) {
      const suffix = modelName.slice(pattern.length);
      return /^-\d{8}$/.test(suffix) || /^-\d{4}-\d{2}-\d{2}$/.test(suffix);
    }
    return false;
  });
}

// Fetch models from a provider
async function fetchModels(provider, url, apiKey) {
  try {
    const headers = {};

    if (provider === "openai" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      const response = await fetch(`${url}/v1/models`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data.map((m) => `openai@${m.id}`);
    }

    if (provider === "anthropic" && apiKey) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      const response = await fetch(`${url}/v1/models`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data.map((m) => `anthropic@${m.id}`);
    }

    if (provider === "gemini" && apiKey) {
      const response = await fetch(`${url}/v1beta/models?key=${apiKey}`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => `gemini@${m.name.replace("models/", "")}`);
    }

    if (provider === "ollama") {
      const response = await fetch(`${url}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models.map((m) => `ollama@${m.name}`);
    }

    if (provider === "lmstudio") {
      const response = await fetch(`${url}/v1/models`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.data.map((m) => `lmstudio@${m.id}`);
    }

    if (provider === "openrouter" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      const response = await fetch(`${url}/api/v1/models`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.data.map((m) => `openrouter@${m.id}`);
    }

    return [];
  } catch (error) {
    return [];
  }
}

// Fetch all available models
async function fetchAllModels() {
  console.log("🔍 Fetching available models from cloud providers (OpenAI, Anthropic, Gemini)...\n");

  const promises = [
    fetchModels("openai", config.urls.openai, config.apiKeys.openai),
    fetchModels("anthropic", config.urls.anthropic, config.apiKeys.anthropic),
    fetchModels("gemini", config.urls.gemini, config.apiKeys.gemini),
    // Skip local models (Ollama, LM Studio) and OpenRouter for now
  ];

  const results = await Promise.all(promises);
  return results.flat();
}

// Test tool definition
const testTool = tool({
  description: "Get the current time",
  inputSchema: zodSchema(
    z.object({
      timezone: z.string().optional().describe("Optional timezone"),
    })
  ),
  execute: async (args) => ({ time: new Date().toISOString() }),
});

// Test a single model
async function testModel(modelId) {
  const [provider, modelName] = modelId.includes("@")
    ? [modelId.split("@")[0], getModelName(modelId)]
    : ["unknown", modelId];

  try {
    let providerInstance;

    if (provider === "openai") {
      providerInstance = createOpenAI({ apiKey: config.apiKeys.openai });
    } else if (provider === "anthropic") {
      providerInstance = createAnthropic({ apiKey: config.apiKeys.anthropic });
    } else if (provider === "gemini") {
      providerInstance = createGoogleGenerativeAI({ apiKey: config.apiKeys.gemini });
    } else if (provider === "openrouter") {
      providerInstance = createOpenRouter({ apiKey: config.apiKeys.openrouter });
    } else if (provider === "ollama") {
      providerInstance = createOpenAICompatible({
        name: "ollama",
        baseURL: `${config.urls.ollama}/v1`,
      });
    } else if (provider === "lmstudio") {
      providerInstance = createOpenAICompatible({
        name: "lmstudio",
        baseURL: config.urls.lmstudio,
      });
    } else {
      return { modelId, status: "skipped", reason: "Unknown provider" };
    }

    const model = providerInstance(modelName);
    const result = await generateText({
      model,
      messages: [{ role: "user", content: "What time is it?" }],
      tools: { get_time: testTool },
      maxTokens: 100,
    });

    return {
      modelId,
      provider,
      status: "success",
      toolCalled: result.toolCalls && result.toolCalls.length > 0,
    };
  } catch (error) {
    return {
      modelId,
      provider,
      status: "error",
      error: error.message,
    };
  }
}

// Main
async function main() {
  console.log("🧪 Comprehensive Tool Support Testing\n");
  console.log("=".repeat(80));
  console.log();

  // Fetch all models
  const allModels = await fetchAllModels();
  console.log(`Found ${allModels.length} available models across all providers\n`);

  // Check which are whitelisted
  const whitelistedModels = allModels.filter((m) => isWhitelisted(m, config.whitelist));
  const nonWhitelistedModels = allModels.filter((m) => !isWhitelisted(m, config.whitelist));

  console.log(`✅ ${whitelistedModels.length} models are whitelisted`);
  console.log(`⚪ ${nonWhitelistedModels.length} models are NOT whitelisted\n`);

  // Group by provider
  const byProvider = allModels.reduce((acc, m) => {
    const provider = m.split("@")[0];
    if (!acc[provider]) acc[provider] = { total: 0, whitelisted: 0 };
    acc[provider].total++;
    if (isWhitelisted(m, config.whitelist)) acc[provider].whitelisted++;
    return acc;
  }, {});

  console.log("By provider:");
  Object.entries(byProvider).forEach(([provider, counts]) => {
    console.log(`  ${provider}: ${counts.whitelisted}/${counts.total} whitelisted`);
  });
  console.log();

  // Select models to test
  let modelsToTest;
  if (TEST_ALL) {
    modelsToTest = whitelistedModels;
    console.log(`🔬 Testing ALL ${whitelistedModels.length} whitelisted models (this may take a while)...\n`);
  } else {
    // Sample: 2 from each provider
    modelsToTest = Object.keys(byProvider).flatMap((provider) => {
      const providerModels = whitelistedModels.filter((m) => m.startsWith(`${provider}@`));
      return providerModels.slice(0, 2);
    });
    console.log(`🔬 Testing SAMPLE of ${modelsToTest.length} whitelisted models (use --test-all for full test)...\n`);
  }

  // Test models
  const results = [];
  for (const modelId of modelsToTest) {
    process.stdout.write(`Testing ${modelId.padEnd(50)} ... `);
    const result = await testModel(modelId);
    results.push(result);

    if (result.status === "success") {
      console.log(result.toolCalled ? "✅ TOOL CALLED" : "⚠️  NO TOOL CALL");
    } else if (result.status === "skipped") {
      console.log(`⏭️  SKIPPED (${result.reason})`);
    } else {
      console.log(`❌ ${result.error.slice(0, 50)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Summary
  console.log();
  console.log("=".repeat(80));
  console.log("\n📊 SUMMARY\n");

  const successful = results.filter((r) => r.status === "success");
  const toolCalled = results.filter((r) => r.toolCalled);
  const errors = results.filter((r) => r.status === "error");

  console.log(`Tested: ${results.length} models`);
  console.log(`  ✅ Success: ${successful.length}`);
  console.log(`  🔧 Tool called: ${toolCalled.length}`);
  console.log(`  ❌ Errors: ${errors.length}`);

  if (toolCalled.length > 0) {
    console.log("\n✅ MODELS THAT SUCCESSFULLY CALLED TOOLS:\n");
    toolCalled.forEach((m) => console.log(`  ${m.modelId}`));
  }

  if (errors.length > 0) {
    console.log("\n❌ MODELS WITH ERRORS:\n");
    errors.forEach((e) => console.log(`  ${e.modelId}: ${e.error.slice(0, 80)}`));
  }

  // Recommendations
  console.log("\n💡 RECOMMENDATIONS:\n");

  if (whitelistedModels.length < allModels.length * 0.1) {
    console.log("  ⚠️  Very few models are whitelisted. Consider adding more patterns.");
  }

  if (toolCalled.length === successful.length && successful.length > 0) {
    console.log("  ✅ All tested whitelisted models support tools!");
  } else if (toolCalled.length > 0) {
    console.log(`  ⚠️  ${successful.length - toolCalled.length} models didn't call tools despite being whitelisted.`);
  }

  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
