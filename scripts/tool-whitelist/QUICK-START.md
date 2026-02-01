# Quick Start - Whitelist Maintenance

## TL;DR

```bash
# Full workflow (expensive, thorough)
node scripts/tool-whitelist/fetch-available-models.mjs
node scripts/tool-whitelist/test-models-tools.mjs
node scripts/tool-whitelist/generate-whitelist.mjs

# Quick check (cheap, fast)
node scripts/tool-whitelist/fetch-available-models.mjs
node scripts/tool-whitelist/test-models-tools.mjs --limit 3
node scripts/tool-whitelist/generate-whitelist.mjs
```

## Common Tasks

### Update whitelist for new models

```bash
# 1. Fetch latest models
node scripts/tool-whitelist/fetch-available-models.mjs

# 2. Test sample
node scripts/tool-whitelist/test-models-tools.mjs --limit 5

# 3. Generate whitelist
node scripts/tool-whitelist/generate-whitelist.mjs

# 4. Review and update code
cat scripts/tool-whitelist/generated-whitelist.txt
```

### Test specific provider

```bash
node scripts/tool-whitelist/fetch-available-models.mjs
node scripts/tool-whitelist/test-models-tools.mjs --provider openai
node scripts/tool-whitelist/generate-whitelist.mjs
```

### Full validation (monthly)

```bash
node scripts/tool-whitelist/fetch-available-models.mjs
node scripts/tool-whitelist/test-models-tools.mjs --limit 10
node scripts/tool-whitelist/generate-whitelist.mjs
```

### Complete re-test (quarterly)

```bash
node scripts/tool-whitelist/fetch-available-models.mjs
node scripts/tool-whitelist/test-models-tools.mjs  # No limit - tests ALL models
node scripts/tool-whitelist/generate-whitelist.mjs
```

## Output Files

- `available-models.json` - All models from APIs
- `tool-test-results.json` - Test results
- `generated-whitelist.txt` - New whitelist

## Options Cheat Sheet

### test-models-tools.mjs
- `--limit N` - Test only N models per provider
- `--provider name` - Test only: openai|anthropic|gemini|openrouter

### generate-whitelist.mjs
- `--min-success-rate N` - Minimum rate 0-1 (default: 1.0)
- `--output path` - Custom output path

## See Also

- [README-WHITELIST-MAINTENANCE.md](./README-WHITELIST-MAINTENANCE.md) - Full documentation
- [TOOL_SUPPORT_TESTING.md](./TOOL_SUPPORT_TESTING.md) - Latest test results
