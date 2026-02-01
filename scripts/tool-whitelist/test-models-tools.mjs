#!/usr/bin/env node

/**
 * Test Models for Tool Support
 *
 * Reads available-models.json and tests each model for tool calling support.
 * Writes results to tool-test-results.json.
 *
 * Usage:
 *   node scripts/test-models-tools.mjs [--limit N] [--provider name]
 *
 * Options:
 *   --limit N         Test only first N models per provider (default: all)
 *   --provider name   Test only specific provider (openai|anthropic|gemini|openrouter)
 *
 * Prerequisites:
 *   1. Run fetch-available-models.mjs first
 *   2. Ensure data.json has valid API keys
 *
 * Output:
 *   scripts/tool-test-results.json
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;
const providerIndex = args.indexOf('--provider');
const PROVIDER_FILTER = providerIndex !== -1 ? args[providerIndex + 1] : null;

// Load configuration
function loadConfig() {
  try {
    const dataPath = join(__dirname, '..', 'data.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf8'));
    return {
      openai: data.apiKey,
      anthropic: data.anthropicApiKey,
      gemini: data.geminiApiKey,
      openrouter: data.openrouterApiKey,
    };
  } catch (error) {
    console.error('❌ Error loading data.json:', error.message);
    process.exit(1);
  }
}

// Load available models
function loadAvailableModels() {
  try {
    const modelsPath = join(__dirname, 'available-models.json');
    return JSON.parse(readFileSync(modelsPath, 'utf8'));
  } catch (error) {
    console.error('❌ Error loading available-models.json:', error.message);
    console.error('   Run fetch-available-models.mjs first');
    process.exit(1);
  }
}

const apiKeys = loadConfig();
const availableModels = loadAvailableModels();

// Test tool definition
const testTool = tool({
  description: 'Get the current time in ISO format',
  inputSchema: zodSchema(
    z.object({
      timezone: z.string().optional().describe('Optional timezone'),
    })
  ),
  execute: async (args) => ({
    time: new Date().toISOString(),
    timezone: args.timezone || 'UTC',
  }),
});

// Test a single model
async function testModel(modelInfo) {
  const { provider, id, fullId } = modelInfo;

  try {
    let providerInstance;

    if (provider === 'openai') {
      providerInstance = createOpenAI({ apiKey: apiKeys.openai });
    } else if (provider === 'anthropic') {
      providerInstance = createAnthropic({ apiKey: apiKeys.anthropic });
    } else if (provider === 'gemini') {
      providerInstance = createGoogleGenerativeAI({ apiKey: apiKeys.gemini });
    } else if (provider === 'openrouter') {
      providerInstance = createOpenRouter({ apiKey: apiKeys.openrouter });
    } else {
      return {
        ...modelInfo,
        status: 'skipped',
        reason: 'Unknown provider',
        testedAt: new Date().toISOString(),
      };
    }

    const model = providerInstance(id);
    const result = await generateText({
      model,
      messages: [{ role: 'user', content: 'What time is it right now?' }],
      tools: { get_time: testTool },
      maxTokens: 100,
    });

    const toolCalled = result.toolCalls && result.toolCalls.length > 0;

    return {
      ...modelInfo,
      status: 'success',
      supportsTools: toolCalled,
      response: {
        text: result.text?.slice(0, 100),
        toolCalls: result.toolCalls?.length || 0,
      },
      testedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...modelInfo,
      status: 'error',
      supportsTools: false,
      error: {
        message: error.message,
        code: error.code,
      },
      testedAt: new Date().toISOString(),
    };
  }
}

// Main
async function main() {
  console.log('🧪 Testing Models for Tool Support\n');
  console.log('='.repeat(80));
  console.log();

  if (LIMIT) {
    console.log(`⚙️  Limit: ${LIMIT} models per provider`);
  }
  if (PROVIDER_FILTER) {
    console.log(`⚙️  Provider filter: ${PROVIDER_FILTER}`);
  }
  console.log();

  const results = {
    testedAt: new Date().toISOString(),
    configuration: {
      limit: LIMIT,
      providerFilter: PROVIDER_FILTER,
    },
    summary: {
      totalTested: 0,
      successful: 0,
      errors: 0,
      supportsTools: 0,
      byProvider: {},
    },
    models: [],
  };

  // Collect models to test
  const modelsToTest = [];
  for (const [provider, providerData] of Object.entries(availableModels.providers)) {
    if (PROVIDER_FILTER && provider !== PROVIDER_FILTER) {
      continue;
    }

    const models = LIMIT ? providerData.models.slice(0, LIMIT) : providerData.models;
    modelsToTest.push(...models);

    results.summary.byProvider[provider] = {
      total: models.length,
      tested: 0,
      supportsTools: 0,
      errors: 0,
    };
  }

  console.log(`Testing ${modelsToTest.length} models...\n`);

  // Test each model
  for (let i = 0; i < modelsToTest.length; i++) {
    const modelInfo = modelsToTest[i];
    const progress = `[${i + 1}/${modelsToTest.length}]`;

    process.stdout.write(`${progress} ${modelInfo.fullId.padEnd(50)} ... `);

    const result = await testModel(modelInfo);
    results.models.push(result);

    // Update summary
    results.summary.totalTested++;
    const providerSummary = results.summary.byProvider[modelInfo.provider];
    providerSummary.tested++;

    if (result.status === 'success') {
      results.summary.successful++;
      if (result.supportsTools) {
        results.summary.supportsTools++;
        providerSummary.supportsTools++;
        console.log('✅ TOOLS');
      } else {
        console.log('⚪ NO TOOLS');
      }
    } else if (result.status === 'error') {
      results.summary.errors++;
      providerSummary.errors++;
      console.log(`❌ ${result.error.message.slice(0, 40)}`);
    } else {
      console.log('⏭️  SKIPPED');
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Write results
  const outputPath = join(__dirname, 'tool-test-results.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log();
  console.log('='.repeat(80));
  console.log('\n📊 SUMMARY\n');
  console.log(`Total tested: ${results.summary.totalTested}`);
  console.log(`  ✅ Success: ${results.summary.successful}`);
  console.log(`  🔧 Supports tools: ${results.summary.supportsTools}`);
  console.log(`  ❌ Errors: ${results.summary.errors}`);

  console.log('\nBy provider:');
  Object.entries(results.summary.byProvider).forEach(([provider, summary]) => {
    console.log(`  ${provider}: ${summary.supportsTools}/${summary.tested} support tools`);
  });

  console.log(`\n✅ Results written to: ${outputPath}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
