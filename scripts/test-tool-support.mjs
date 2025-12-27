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

// Simple test tool
const testTool = {
  type: "function",
  function: {
    name: "test_function",
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
    },
  },
};

// Models to test (5 random + specific ones)
const modelsToTest = [
  "openai@gpt-5.2-chat-latest", // Should support tools
  "anthropic@claude-opus-4-5-20251101", // Should support tools
  "gemini@gemini-2.5-pro", // Should support tools
  "openrouter@openai/gpt-4o", // Should support tools
  "ollama@gemma3:4b", // Likely won't support tools
];

// Get API keys from data.json
const apiKeys = {
  openai: data.apiKey,
  anthropic: data.anthropicApiKey,
  gemini: data.geminiApiKey,
  openrouter: data.openrouterApiKey,
};

// Results tracking
const toolSupportedModels = [];
const toolUnsupportedModels = [];
const errorModels = [];

async function testModelToolSupport(modelId) {
  const [provider, modelName] = modelId.split("@");

  console.log(`\n🧪 Testing: ${modelId}`);

  try {
    let model;
    let apiKey;

    // Initialize provider based on prefix
    switch (provider) {
      case "openai":
        apiKey = apiKeys.openai;
        if (!apiKey) {
          console.log(`⏭️  Skipped (no API key)`);
          return;
        }
        const openai = createOpenAI({ apiKey });
        model = openai(modelName);
        break;

      case "anthropic":
        apiKey = apiKeys.anthropic;
        if (!apiKey) {
          console.log(`⏭️  Skipped (no API key)`);
          return;
        }
        const anthropic = createAnthropic({ apiKey });
        model = anthropic(modelName);
        break;

      case "gemini":
        apiKey = apiKeys.gemini;
        if (!apiKey) {
          console.log(`⏭️  Skipped (no API key)`);
          return;
        }
        const gemini = createGoogleGenerativeAI({ apiKey });
        model = gemini(modelName);
        break;

      case "openrouter":
        apiKey = apiKeys.openrouter;
        if (!apiKey) {
          console.log(`⏭️  Skipped (no API key)`);
          return;
        }
        const openrouter = createOpenRouter({ apiKey });
        model = openrouter(modelName);
        break;

      case "ollama":
        // Ollama doesn't require API key, uses local endpoint
        const openaiCompat = createOpenAI({
          apiKey: "ollama",
          baseURL: "http://localhost:11434/v1",
        });
        model = openaiCompat(modelName);
        break;

      default:
        console.log(`❌ Unknown provider: ${provider}`);
        errorModels.push({ model: modelId, error: "Unknown provider" });
        return;
    }

    // Make a minimal generateText call with tools
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
      maxToolRoundtrips: 0, // Don't actually call tools, just test if they're accepted
    });

    // If we got here without error, tools are supported
    console.log(`✅ Tools supported`);
    toolSupportedModels.push(modelId);
  } catch (error) {
    const errorMsg = error?.message || String(error);

    // Check if error is tool-related
    if (
      errorMsg.includes("tool") ||
      errorMsg.includes("function") ||
      errorMsg.includes("not support") ||
      errorMsg.includes("does not support") ||
      errorMsg.includes("schema must be") ||
      errorMsg.includes("input_schema")
    ) {
      console.log(`❌ Tools not supported: ${errorMsg.substring(0, 100)}`);
      toolUnsupportedModels.push(modelId);
    } else {
      console.log(`⚠️  Error: ${errorMsg.substring(0, 100)}`);
      errorModels.push({ model: modelId, error: errorMsg.substring(0, 100) });
    }
  }
}

async function main() {
  console.log("🚀 Testing Tool Support for AI Models");
  console.log("=====================================\n");
  console.log(`Testing ${modelsToTest.length} models...\n`);

  // Test each model
  for (const modelId of modelsToTest) {
    await testModelToolSupport(modelId);
    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Generate report
  console.log("\n\n📊 RESULTS");
  console.log("===========\n");

  console.log(`✅ Models with Tool Support (${toolSupportedModels.length}):`);
  toolSupportedModels.forEach((m) => console.log(`   - ${m}`));

  console.log(`\n❌ Models without Tool Support (${toolUnsupportedModels.length}):`);
  toolUnsupportedModels.forEach((m) => console.log(`   - ${m}`));

  if (errorModels.length > 0) {
    console.log(`\n⚠️  Models with Errors (${errorModels.length}):`);
    errorModels.forEach((m) => console.log(`   - ${m.model}: ${m.error}`));
  }

  // Save results to files
  const resultsDir = path.join(projectRoot, "tool-support-results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(resultsDir, "tool-supported-models.json"),
    JSON.stringify(toolSupportedModels, null, 2)
  );

  fs.writeFileSync(
    path.join(resultsDir, "tool-unsupported-models.json"),
    JSON.stringify(toolUnsupportedModels, null, 2)
  );

  fs.writeFileSync(
    path.join(resultsDir, "tool-error-models.json"),
    JSON.stringify(errorModels, null, 2)
  );

  console.log(`\n📁 Results saved to: ${resultsDir}`);
}

main().catch(console.error);
