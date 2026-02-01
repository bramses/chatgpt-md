#!/usr/bin/env node

/**
 * Fetch Available Models
 *
 * Fetches all currently available models from configured providers
 * and writes them to a JSON file.
 *
 * Usage:
 *   node scripts/fetch-available-models.mjs
 *
 * Output:
 *   scripts/available-models.json
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    };
  } catch (error) {
    console.error("❌ Error loading data.json:", error.message);
    process.exit(1);
  }
}

const config = loadConfig();

// Fetch models from a provider
async function fetchModels(provider, url, apiKey) {
  try {
    const headers = {};

    if (provider === "openai" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      const response = await fetch(`${url}/v1/models`, { headers });
      if (!response.ok) {
        console.log(`  ⚠️  OpenAI: ${response.status} ${response.statusText}`);
        return [];
      }
      const data = await response.json();
      return data.data.map((m) => ({
        id: m.id,
        fullId: `openai@${m.id}`,
        provider: "openai",
        created: m.created,
        ownedBy: m.owned_by,
      }));
    }

    if (provider === "anthropic" && apiKey) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      const response = await fetch(`${url}/v1/models`, { headers });
      if (!response.ok) {
        console.log(`  ⚠️  Anthropic: ${response.status} ${response.statusText}`);
        return [];
      }
      const data = await response.json();
      return data.data.map((m) => ({
        id: m.id,
        fullId: `anthropic@${m.id}`,
        provider: "anthropic",
        displayName: m.display_name,
        created: m.created_at,
      }));
    }

    if (provider === "gemini" && apiKey) {
      const response = await fetch(`${url}/v1beta/models?key=${apiKey}`);
      if (!response.ok) {
        console.log(`  ⚠️  Gemini: ${response.status} ${response.statusText}`);
        return [];
      }
      const data = await response.json();
      return data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => {
          const modelId = m.name.replace("models/", "");
          return {
            id: modelId,
            fullId: `gemini@${modelId}`,
            provider: "gemini",
            displayName: m.displayName,
            description: m.description,
          };
        });
    }

    if (provider === "openrouter" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      const response = await fetch(`${url}/api/v1/models`, { headers });
      if (!response.ok) {
        console.log(`  ⚠️  OpenRouter: ${response.status} ${response.statusText}`);
        return [];
      }
      const data = await response.json();
      return data.data.map((m) => ({
        id: m.id,
        fullId: `openrouter@${m.id}`,
        provider: "openrouter",
        name: m.name,
        description: m.description,
      }));
    }

    return [];
  } catch (error) {
    console.log(`  ❌ ${provider}: ${error.message}`);
    return [];
  }
}

// Main
async function main() {
  console.log("🔍 Fetching Available Models\n");
  console.log("=".repeat(80));
  console.log();

  const results = {
    fetchedAt: new Date().toISOString(),
    providers: {},
    summary: {
      totalModels: 0,
      byProvider: {},
    },
  };

  // Fetch from each provider
  const providers = [
    { name: "openai", url: config.urls.openai, key: config.apiKeys.openai },
    { name: "anthropic", url: config.urls.anthropic, key: config.apiKeys.anthropic },
    { name: "gemini", url: config.urls.gemini, key: config.apiKeys.gemini },
    { name: "openrouter", url: config.urls.openrouter, key: config.apiKeys.openrouter },
  ];

  for (const { name, url, key } of providers) {
    console.log(`Fetching ${name} models...`);
    const models = await fetchModels(name, url, key);

    results.providers[name] = {
      count: models.length,
      models: models,
    };

    results.summary.byProvider[name] = models.length;
    results.summary.totalModels += models.length;

    console.log(`  ✅ Found ${models.length} models\n`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Write to file
  const outputPath = join(__dirname, "available-models.json");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log("=".repeat(80));
  console.log("\n📊 SUMMARY\n");
  console.log(`Total models: ${results.summary.totalModels}`);
  Object.entries(results.summary.byProvider).forEach(([provider, count]) => {
    console.log(`  ${provider}: ${count}`);
  });

  console.log(`\n✅ Results written to: ${outputPath}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
