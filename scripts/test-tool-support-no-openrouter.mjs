#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateText, tool, zodSchema } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Load API keys from data.json
const dataPath = path.join(projectRoot, "data.json");
const dataContent = fs.readFileSync(dataPath, "utf-8");
const data = JSON.parse(dataContent);

const apiKeys = {
  openai: data.apiKey,
  anthropic: data.anthropicApiKey,
  gemini: data.geminiApiKey,
};

const urls = {
  openai: data.openaiUrl,
  anthropic: data.anthropicUrl,
  gemini: data.geminiUrl,
};

// Results tracking by provider (no OpenRouter)
const results = {
  openai: { supported: [], unsupported: [], errors: [] },
  anthropic: { supported: [], unsupported: [], errors: [] },
  gemini: { supported: [], unsupported: [], errors: [] },
};

// Test counter
let tested = 0;
let skipped = 0;

// Create a test tool using Zod schema (EXACTLY as plugin's ToolRegistry does)
const testTool = tool({
  description: "A simple test function",
  inputSchema: zodSchema(
    z.object({
      message: z.string().describe("A test message"),
    })
  ),
  execute: async (args) => {
    return { success: true, message: args.message };
  },
});

/**
 * Fetch available models from a provider using the API
 */
async function fetchModelsFromProvider(provider, apiKey, url) {
  try {
    let models = [];

    switch (provider) {
      case "openai":
        const openaiResponse = await fetch(`${url}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const openaiData = await openaiResponse.json();
        models = openaiData.data
          .filter((m) => {
            const id = m.id;
            const isGenerationModel =
              id.includes("o3") ||
              id.includes("o4") ||
              id.includes("o1") ||
              id.includes("gpt-4") ||
              id.includes("gpt-5") ||
              id.includes("gpt-3");
            const isExcluded =
              id.includes("audio") ||
              id.includes("transcribe") ||
              id.includes("realtime") ||
              id.includes("o1-pro") ||
              id.includes("tts");
            return isGenerationModel && !isExcluded;
          })
          .map((m) => `openai@${m.id}`);
        break;

      case "anthropic":
        const anthropicResponse = await fetch(`${url}/v1/models`, {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
            "Content-Type": "application/json",
          },
        });
        const anthropicData = await anthropicResponse.json();
        models = anthropicData.data.filter((m) => m.type === "model" && m.id).map((m) => `anthropic@${m.id}`);
        break;

      case "gemini":
        // Gemini uses a different endpoint
        const geminiResponse = await fetch(`${url}/v1beta/models?key=${apiKey}`);
        const geminiData = await geminiResponse.json();
        models = geminiData.models
          .filter((m) => m.name.includes("gemini"))
          .map((m) => {
            const modelName = m.name.replace("models/", "");
            return `gemini@${modelName}`;
          });
        break;
    }

    return models;
  } catch (error) {
    console.error(`Error fetching models from ${provider}:`, error.message);
    return [];
  }
}

async function testModelToolSupport(modelId) {
  const [provider, modelName] = modelId.split("@");

  if (!provider || !modelName) {
    console.log(`⏭️  Skipped invalid format: ${modelId}`);
    skipped++;
    return;
  }

  tested++;
  console.log(`[${tested}] Testing: ${modelId}`);

  try {
    let model;

    // Initialize provider based on prefix (no OpenRouter)
    switch (provider) {
      case "openai":
        const openai = createOpenAI({ apiKey: apiKeys.openai });
        model = openai(modelName);
        break;

      case "anthropic":
        const anthropic = createAnthropic({ apiKey: apiKeys.anthropic });
        model = anthropic(modelName);
        break;

      case "gemini":
        const gemini = createGoogleGenerativeAI({ apiKey: apiKeys.gemini });
        model = gemini(modelName);
        break;

      default:
        console.log(`❌ Unknown provider: ${provider}`);
        results[provider]?.errors.push({
          model: modelId,
          error: "Unknown provider",
        });
        return;
    }

    // Make a minimal generateText call with tools using Zod schema (same as plugin)
    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: "Say hello",
        },
      ],
      tools: {
        test_function: testTool,
      },
      maxToolRoundtrips: 0,
    });

    // If we got here without error, tools are supported
    console.log(`  ✅ Tools supported`);
    results[provider].supported.push(modelId);
  } catch (error) {
    const errorMsg = error?.message || String(error);

    // Check if error is tool-related
    if (
      errorMsg.includes("tool") ||
      errorMsg.includes("function") ||
      errorMsg.includes("not support") ||
      errorMsg.includes("does not support") ||
      errorMsg.includes("Tool use is not supported") ||
      errorMsg.includes("schema must be") ||
      errorMsg.includes("input_schema")
    ) {
      console.log(`  ❌ Tools not supported`);
      results[provider].unsupported.push(modelId);
    } else {
      console.log(`  ⚠️  Error: ${errorMsg.substring(0, 80)}`);
      results[provider].errors.push({
        model: modelId,
        error: errorMsg.substring(0, 100),
      });
    }
  }
}

async function main() {
  console.log("🚀 Testing Tool Support - Fetching Models Dynamically (No OpenRouter)");
  console.log("======================================================================\n");

  // Fetch models from each provider (cloud-based only, no OpenRouter)
  const allModels = [];

  for (const provider of ["openai", "anthropic", "gemini"]) {
    const apiKey = apiKeys[provider];
    const url = urls[provider];

    if (!apiKey) {
      console.log(`⏭️  Skipping ${provider.toUpperCase()} (no API key)`);
      continue;
    }

    console.log(`📥 Fetching models from ${provider.toUpperCase()}...`);
    const models = await fetchModelsFromProvider(provider, apiKey, url);
    console.log(`   Found ${models.length} models\n`);
    allModels.push(...models);
  }

  // Note: OpenRouter, Ollama and LM Studio are excluded from testing
  console.log(`\n🧪 Testing ${allModels.length} models for tool support...\n`);

  // Test each model
  for (const modelId of allModels) {
    await testModelToolSupport(modelId);
    // Add small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Compile final results
  const toolSupportedModels = [];
  const toolUnsupportedModels = [];

  for (const provider in results) {
    toolSupportedModels.push(...results[provider].supported);
    toolUnsupportedModels.push(...results[provider].unsupported);
  }

  // Generate report
  console.log("\n\n📊 RESULTS");
  console.log("===========\n");

  console.log(`Tested: ${tested} models`);
  console.log(`Skipped: ${skipped} models\n`);

  console.log(`✅ Models with Tool Support (${toolSupportedModels.length}):`);
  for (const provider in results) {
    if (results[provider].supported.length > 0) {
      console.log(`\n   ${provider.toUpperCase()}:`);
      results[provider].supported.forEach((m) => console.log(`     - ${m}`));
    }
  }

  console.log(`\n❌ Models without Tool Support (${toolUnsupportedModels.length}):`);
  for (const provider in results) {
    if (results[provider].unsupported.length > 0) {
      console.log(`\n   ${provider.toUpperCase()}:`);
      results[provider].unsupported.forEach((m) => console.log(`     - ${m}`));
    }
  }

  let totalErrors = 0;
  for (const provider in results) {
    totalErrors += results[provider].errors.length;
  }

  if (totalErrors > 0) {
    console.log(`\n⚠️  Models with Errors (${totalErrors}):`);
    for (const provider in results) {
      if (results[provider].errors.length > 0) {
        console.log(`\n   ${provider.toUpperCase()}:`);
        results[provider].errors.forEach((m) => console.log(`     - ${m.model}: ${m.error}`));
      }
    }
  }

  // Save results to files
  const resultsDir = path.join(projectRoot, "tool-support-results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  // File 1: Models that support tools
  fs.writeFileSync(
    path.join(resultsDir, "tool-supported-models.json"),
    JSON.stringify(
      {
        description: "Models that support tool/function calling",
        timestamp: new Date().toISOString(),
        count: toolSupportedModels.length,
        models: toolSupportedModels,
        byProvider: {
          openai: results.openai.supported,
          anthropic: results.anthropic.supported,
          gemini: results.gemini.supported,
        },
      },
      null,
      2
    )
  );

  // File 2: Models that don't support tools
  fs.writeFileSync(
    path.join(resultsDir, "tool-unsupported-models.json"),
    JSON.stringify(
      {
        description: "Models that do not support tool/function calling",
        timestamp: new Date().toISOString(),
        count: toolUnsupportedModels.length,
        models: toolUnsupportedModels,
        byProvider: {
          openai: results.openai.unsupported,
          anthropic: results.anthropic.unsupported,
          gemini: results.gemini.unsupported,
        },
      },
      null,
      2
    )
  );

  // File 3: Error models (for reference)
  const errorModels = [];
  for (const provider in results) {
    errorModels.push(...results[provider].errors);
  }

  fs.writeFileSync(
    path.join(resultsDir, "tool-error-models.json"),
    JSON.stringify(
      {
        description: "Models that encountered errors during testing",
        timestamp: new Date().toISOString(),
        count: errorModels.length,
        models: errorModels,
      },
      null,
      2
    )
  );

  console.log(`\n📁 Results saved to: ${resultsDir}`);
  console.log(`   - tool-supported-models.json`);
  console.log(`   - tool-unsupported-models.json`);
  console.log(`   - tool-error-models.json`);
}

main().catch(console.error);
