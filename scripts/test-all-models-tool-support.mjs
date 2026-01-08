#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Load models from models.txt
const modelsPath = path.join(projectRoot, "models.txt");
const modelsContent = fs.readFileSync(modelsPath, "utf-8");
const allModels = JSON.parse(modelsContent);

// Load API keys from data.json
const dataPath = path.join(projectRoot, "data.json");
const dataContent = fs.readFileSync(dataPath, "utf-8");
const data = JSON.parse(dataContent);

const apiKeys = {
  openai: data.apiKey,
  anthropic: data.anthropicApiKey,
  gemini: data.geminiApiKey,
  openrouter: data.openrouterApiKey,
};

// Results tracking by provider
const results = {
  openai: { supported: [], unsupported: [], errors: [] },
  anthropic: { supported: [], unsupported: [], errors: [] },
  gemini: { supported: [], unsupported: [], errors: [] },
  openrouter: { supported: [], unsupported: [], errors: [] },
  ollama: { supported: [], unsupported: [], errors: [] },
  lmstudio: { supported: [], unsupported: [], errors: [] },
};

// Test counter
let tested = 0;
let skipped = 0;

async function testModelToolSupport(modelId) {
  const [provider, modelName] = modelId.split("@");

  if (!provider || !modelName) {
    console.log(`⏭️  Skipped invalid format: ${modelId}`);
    skipped++;
    return;
  }

  // Skip if no API key for this provider
  if (provider !== "ollama" && provider !== "lmstudio" && !apiKeys[provider]) {
    console.log(`⏭️  Skipped ${modelId} (no API key for ${provider})`);
    skipped++;
    return;
  }

  tested++;
  console.log(`[${tested}] Testing: ${modelId}`);

  try {
    let model;

    // Initialize provider based on prefix
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

      case "openrouter":
        const openrouter = createOpenRouter({ apiKey: apiKeys.openrouter });
        model = openrouter(modelName);
        break;

      case "ollama":
        const ollamaClient = createOpenAI({
          apiKey: "ollama",
          baseURL: "http://localhost:11434/v1",
        });
        model = ollamaClient(modelName);
        break;

      case "lmstudio":
        const lmstudioClient = createOpenAI({
          apiKey: "lmstudio",
          baseURL: "http://localhost:1234/v1",
        });
        model = lmstudioClient(modelName);
        break;

      default:
        console.log(`❌ Unknown provider: ${provider}`);
        results[provider]?.errors.push({
          model: modelId,
          error: "Unknown provider",
        });
        return;
    }

    // Make a minimal generateText call with tools
    // Use maxToolRoundtrips: 0 to avoid actually executing tools
    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: "Say hello",
        },
      ],
      tools: {
        test_function: {
          description: "A simple test function",
          parameters: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "A test message",
              },
            },
            required: ["message"],
            additionalProperties: false,
          },
        },
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
  console.log("🚀 Testing Tool Support for All AI Models");
  console.log("==========================================\n");
  console.log(`Total models to test: ${allModels.length}\n`);

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
        count: toolSupportedModels.length,
        models: toolSupportedModels,
        byProvider: {
          openai: results.openai.supported,
          anthropic: results.anthropic.supported,
          gemini: results.gemini.supported,
          openrouter: results.openrouter.supported,
          ollama: results.ollama.supported,
          lmstudio: results.lmstudio.supported,
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
        count: toolUnsupportedModels.length,
        models: toolUnsupportedModels,
        byProvider: {
          openai: results.openai.unsupported,
          anthropic: results.anthropic.unsupported,
          gemini: results.gemini.unsupported,
          openrouter: results.openrouter.unsupported,
          ollama: results.ollama.unsupported,
          lmstudio: results.lmstudio.unsupported,
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
