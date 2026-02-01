#!/usr/bin/env node

/**
 * Test script to verify that whitelisted models actually support tool calling
 *
 * This script:
 * 1. Reads the default whitelist from ToolSupportDetector
 * 2. Loads API keys from data.json
 * 3. For each model, makes a minimal API call with a simple tool definition
 * 4. Reports which models succeed/fail with tool calling
 *
 * Usage:
 *   node scripts/test-tool-whitelist.mjs
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, tool, zodSchema } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load API keys from data.json
function loadApiKeys() {
  try {
    const dataPath = join(__dirname, '..', 'data.json');
    const data = JSON.parse(readFileSync(dataPath, 'utf8'));
    return {
      openai: data.apiKey,
      anthropic: data.anthropicApiKey,
      gemini: data.geminiApiKey,
    };
  } catch (error) {
    console.error('❌ Error loading data.json:', error.message);
    console.error('   Make sure data.json exists in the plugin root directory');
    process.exit(1);
  }
}

const API_KEYS = loadApiKeys();

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

// Parse whitelist into array of model patterns
function parseWhitelist(whitelist) {
  return whitelist
    .split(/[,\n]/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

// Determine provider from model name
function getProvider(modelPattern) {
  if (modelPattern.startsWith('gpt-') || modelPattern.startsWith('o')) {
    return 'openai';
  }
  if (modelPattern.startsWith('claude-')) {
    return 'anthropic';
  }
  if (modelPattern.startsWith('gemini-')) {
    return 'gemini';
  }
  return 'unknown';
}

// Create provider instance
function createProvider(providerType) {
  switch (providerType) {
    case 'openai':
      if (!API_KEYS.openai) {
        throw new Error('OpenAI API key not found in data.json');
      }
      return createOpenAI({ apiKey: API_KEYS.openai });

    case 'anthropic':
      if (!API_KEYS.anthropic) {
        throw new Error('Anthropic API key not found in data.json');
      }
      return createAnthropic({ apiKey: API_KEYS.anthropic });

    case 'gemini':
      if (!API_KEYS.gemini) {
        throw new Error('Gemini API key not found in data.json');
      }
      return createGoogleGenerativeAI({ apiKey: API_KEYS.gemini });

    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}

// Simple test tool matching plugin's schema format
const testTool = tool({
  description: 'Get the current time. Returns the current time in ISO format.',
  inputSchema: zodSchema(
    z.object({
      timezone: z.string().optional().describe('Optional timezone (e.g., "UTC", "America/New_York")'),
    })
  ),
  execute: async (args) => {
    const now = new Date();
    return {
      time: now.toISOString(),
      timezone: args.timezone || 'UTC',
      unix: now.getTime(),
    };
  },
});

// Test a single model
async function testModel(modelPattern) {
  const providerType = getProvider(modelPattern);

  if (providerType === 'unknown') {
    return {
      model: modelPattern,
      provider: providerType,
      status: 'skipped',
      error: 'Unknown provider',
    };
  }

  try {
    const provider = createProvider(providerType);
    const model = provider(modelPattern);

    // Make a minimal request with tool
    const result = await generateText({
      model,
      messages: [
        { role: 'user', content: 'What time is it?' }
      ],
      tools: {
        get_time: testTool,
      },
      maxTokens: 50, // Keep it minimal
    });

    // Check if tool was called
    const toolWasCalled = result.toolCalls && result.toolCalls.length > 0;

    return {
      model: modelPattern,
      provider: providerType,
      status: 'success',
      toolCalled: toolWasCalled,
      text: result.text?.slice(0, 100) || '',
    };
  } catch (error) {
    return {
      model: modelPattern,
      provider: providerType,
      status: 'error',
      error: error.message,
      errorCode: error.code,
    };
  }
}

// Main test runner
async function main() {
  console.log('🧪 Testing Tool Support for Whitelisted Models\n');
  console.log('='.repeat(80));
  console.log();

  const models = parseWhitelist(DEFAULT_WHITELIST);
  console.log(`Found ${models.length} models in whitelist\n`);

  const results = [];

  for (const modelPattern of models) {
    process.stdout.write(`Testing ${modelPattern.padEnd(30)} ... `);

    try {
      const result = await testModel(modelPattern);
      results.push(result);

      if (result.status === 'success') {
        if (result.toolCalled) {
          console.log('✅ TOOL CALLED');
        } else {
          console.log('⚠️  NO TOOL CALL (but no error)');
        }
      } else if (result.status === 'skipped') {
        console.log(`⏭️  SKIPPED (${result.error})`);
      } else {
        console.log(`❌ ERROR: ${result.error}`);
      }
    } catch (err) {
      console.log(`❌ UNEXPECTED ERROR: ${err.message}`);
      results.push({
        model: modelPattern,
        status: 'error',
        error: err.message,
      });
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Print summary
  console.log();
  console.log('='.repeat(80));
  console.log('\n📊 SUMMARY\n');

  const byStatus = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`Total models tested: ${results.length}`);
  console.log(`  ✅ Success: ${byStatus.success || 0}`);
  console.log(`  ❌ Errors: ${byStatus.error || 0}`);
  console.log(`  ⏭️  Skipped: ${byStatus.skipped || 0}`);

  const toolCalled = results.filter(r => r.toolCalled).length;
  console.log(`  🔧 Tool called: ${toolCalled}`);

  // Show errors
  const errors = results.filter(r => r.status === 'error');
  if (errors.length > 0) {
    console.log('\n⚠️  MODELS WITH ERRORS:\n');
    errors.forEach(e => {
      console.log(`  ${e.model} (${e.provider}): ${e.error}`);
      if (e.errorCode) {
        console.log(`    Code: ${e.errorCode}`);
      }
    });
  }

  // Show models that didn't call tools
  const noToolCall = results.filter(r => r.status === 'success' && !r.toolCalled);
  if (noToolCall.length > 0) {
    console.log('\n⚠️  MODELS THAT DID NOT CALL TOOLS:\n');
    noToolCall.forEach(m => {
      console.log(`  ${m.model} (${m.provider})`);
      if (m.text) {
        console.log(`    Response: ${m.text}`);
      }
    });
  }

  console.log();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
