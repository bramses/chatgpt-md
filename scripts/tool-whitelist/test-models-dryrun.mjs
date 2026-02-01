#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateText, tool, zodSchema } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
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
  openrouter: data.openrouterApiKey,
};

// Models to test in dry-run (cloud-based models only, no local models)
const modelsToTest = [
  "openai@gpt-5.2-chat-latest", // Should support tools
  "anthropic@claude-opus-4-5-20251101", // Should support tools
  "gemini@gemini-2.5-pro", // Should support tools
  "openrouter@openai/gpt-4o", // Should support tools
  "openrouter@anthropic/claude-opus-4-5", // Should support tools
];

// Results tracking
const results = {
  supported: [],
  unsupported: [],
  errors: [],
  skipped: [],
};

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

async function testModelToolSupport(modelId) {
  const [provider, modelName] = modelId.split("@");

  console.log(`\n🧪 Testing: ${modelId}`);

  // Check if we have API key for this provider
  if (provider !== "ollama" && provider !== "lmstudio" && !apiKeys[provider]) {
    console.log(`⏭️  Skipped (no ${provider.toUpperCase()} API key)`);
    results.skipped.push(modelId);
    return;
  }

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

      default:
        console.log(`❌ Unknown provider: ${provider}`);
        results.errors.push({
          model: modelId,
          error: "Unknown provider",
        });
        return;
    }

    // Make a minimal generateText call with tools using Zod schema (same as plugin)
    console.log(`   Sending request with tools enabled...`);
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
    console.log(`✅ Tools supported`);
    console.log(`   Response: "${response.text.substring(0, 50)}..."`);
    results.supported.push(modelId);
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
      console.log(`❌ Tools not supported`);
      console.log(`   Error: ${errorMsg.substring(0, 80)}`);
      results.unsupported.push(modelId);
    } else {
      console.log(`⚠️  Error: ${errorMsg.substring(0, 80)}`);
      results.errors.push({
        model: modelId,
        error: errorMsg.substring(0, 100),
      });
    }
  }
}

async function main() {
  console.log("🚀 DRY RUN: Testing Tool Support for 5 Models");
  console.log("==============================================\n");
  console.log(`Testing ${modelsToTest.length} models...\n`);

  // Test each model
  for (const modelId of modelsToTest) {
    await testModelToolSupport(modelId);
    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Generate report
  console.log("\n\n📊 DRY RUN RESULTS");
  console.log("===================\n");

  console.log(`✅ Models with Tool Support (${results.supported.length}):`);
  results.supported.forEach((m) => console.log(`   - ${m}`));

  console.log(`\n❌ Models without Tool Support (${results.unsupported.length}):`);
  results.unsupported.forEach((m) => console.log(`   - ${m}`));

  if (results.errors.length > 0) {
    console.log(`\n⚠️  Models with Errors (${results.errors.length}):`);
    results.errors.forEach((m) => console.log(`   - ${m.model}: ${m.error}`));
  }

  if (results.skipped.length > 0) {
    console.log(`\n⏭️  Models Skipped (${results.skipped.length}):`);
    results.skipped.forEach((m) => console.log(`   - ${m}`));
  }

  // Save dry-run results
  const resultsDir = path.join(projectRoot, "tool-support-results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(resultsDir, "dryrun-results.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        description: "Dry-run results for 5 sample models",
        results,
      },
      null,
      2
    )
  );

  console.log(`\n📁 Results saved to: ${resultsDir}/dryrun-results.json`);
}

main().catch(console.error);
