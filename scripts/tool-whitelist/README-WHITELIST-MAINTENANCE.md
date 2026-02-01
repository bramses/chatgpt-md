# Tool Whitelist Maintenance Scripts

Three-step manual workflow for maintaining the default tool whitelist.

## Overview

These scripts help maintain an accurate, up-to-date whitelist of models that support tool calling:

1. **fetch-available-models.mjs** - Fetches all available models from providers
2. **test-models-tools.mjs** - Tests models for tool calling support
3. **generate-whitelist.mjs** - Generates new default whitelist from test results

## Prerequisites

- Valid API keys in `data.json`
- Node.js with ES modules support
- Installed dependencies (`npm install`)

## Workflow

### Step 1: Fetch Available Models

Fetch all currently available models from configured providers.

```bash
node scripts/tool-whitelist/fetch-available-models.mjs
```

**Output**: `scripts/tool-whitelist/available-models.json`

**What it does**:

- Queries each provider's API for available models
- Saves model metadata (id, name, created date, etc.)
- No tool testing - just discovery

**Example output**:

```json
{
  "fetchedAt": "2026-02-01T12:00:00.000Z",
  "providers": {
    "openai": {
      "count": 119,
      "models": [...]
    }
  }
}
```

### Step 2: Test Models for Tool Support

Test each available model with actual tool calls.

```bash
# Test all models (slow, expensive)
node scripts/tool-whitelist/test-models-tools.mjs

# Test only first 5 models per provider (faster)
node scripts/tool-whitelist/test-models-tools.mjs --limit 5

# Test only OpenAI models
node scripts/tool-whitelist/test-models-tools.mjs --provider openai
```

**Options**:

- `--limit N` - Test only first N models per provider
- `--provider name` - Test only specific provider (openai|anthropic|gemini|openrouter)

**Output**: `scripts/tool-whitelist/tool-test-results.json`

**What it does**:

- Loads models from `available-models.json`
- Makes actual API calls with tool definitions
- Records which models successfully call tools
- Saves detailed results including errors

**Example output**:

```json
{
  "testedAt": "2026-02-01T12:30:00.000Z",
  "summary": {
    "totalTested": 157,
    "supportsTools": 89
  },
  "models": [
    {
      "fullId": "openai@gpt-5.2",
      "status": "success",
      "supportsTools": true
    }
  ]
}
```

### Step 3: Generate New Whitelist

Generate a new default whitelist from test results.

```bash
# Generate whitelist (100% success rate required)
node scripts/tool-whitelist/generate-whitelist.mjs

# Allow models with 80%+ success rate
node scripts/tool-whitelist/generate-whitelist.mjs --min-success-rate 0.8

# Output to custom location
node scripts/tool-whitelist/generate-whitelist.mjs --output my-whitelist.txt
```

**Options**:

- `--min-success-rate N` - Minimum success rate 0-1 (default: 1.0)
- `--output path` - Custom output path (default: scripts/tool-whitelist/generated-whitelist.txt)

**Output**: `scripts/tool-whitelist/generated-whitelist.txt`

**What it does**:

- Reads `tool-test-results.json`
- Filters models that support tools
- Groups by base pattern (removes date suffixes)
- Generates formatted whitelist
- Shows comparison with current whitelist

**Example output**:

```
# OpenAI
gpt-5.2
gpt-5.2-chat-latest
o3
o3-mini

# Anthropic
claude-opus-4-5
claude-sonnet-4-5
```

### Step 4: Manual Update

After reviewing the generated whitelist:

1. **Review** `scripts/tool-whitelist/generated-whitelist.txt`
2. **Update** `src/Services/ToolSupportDetector.ts:getDefaultToolWhitelist()`
3. **Test** the plugin with new whitelist
4. **Commit** changes

## Files Generated

| File                      | Purpose                             | Created By |
| ------------------------- | ----------------------------------- | ---------- |
| `available-models.json`   | All available models from providers | Step 1     |
| `tool-test-results.json`  | Tool support test results           | Step 2     |
| `generated-whitelist.txt` | New default whitelist               | Step 3     |

## Example Full Workflow

```bash
# 1. Fetch all available models
node scripts/tool-whitelist/fetch-available-models.mjs

# 2. Test a sample (fast, cheaper)
node scripts/tool-whitelist/test-models-tools.mjs --limit 10

# 3. Generate whitelist
node scripts/tool-whitelist/generate-whitelist.mjs

# 4. Review and update manually
cat scripts/tool-whitelist/generated-whitelist.txt
# Then update ToolSupportDetector.ts
```

## Tips

### Cost Management

- Use `--limit` to test fewer models
- Test only one provider at a time with `--provider`
- Start with small limits, increase if needed

### Testing Strategy

**Quick validation** (fast, cheap):

```bash
node scripts/tool-whitelist/test-models-tools.mjs --limit 5
```

**Thorough validation** (slow, expensive):

```bash
node scripts/tool-whitelist/test-models-tools.mjs
```

**Provider-specific**:

```bash
node scripts/tool-whitelist/test-models-tools.mjs --provider gemini
```

### Automation

These scripts are **intentionally manual**:

- No automatic updates to source code
- Human review required
- Prevents accidental whitelist corruption

## Troubleshooting

### "Error loading available-models.json"

Run step 1 first:

```bash
node scripts/tool-whitelist/fetch-available-models.mjs
```

### "Error loading tool-test-results.json"

Run step 2 first:

```bash
node scripts/tool-whitelist/test-models-tools.mjs
```

### API Errors

- Check API keys in `data.json`
- Verify API credits/quota
- Check network connectivity

## Maintenance Schedule

**Recommended frequency**:

- **Monthly**: Quick validation (`--limit 5`)
- **Quarterly**: Full validation (all models)
- **On-demand**: When new major models are released

## Version History

- **2026-02-01**: Initial version
  - 157 models tested
  - 95% success rate
  - 23 models whitelisted
