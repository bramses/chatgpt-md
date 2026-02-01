# Tool Whitelist Guide

## Overview

The tool whitelist is a privacy-focused safety mechanism that ensures only models **confirmed to support tools** can use AI tool calling features. This prevents errors and unexpected behavior when models don't understand or properly implement tool calls.

**Default Policy**: Tools are **disabled by default** for all models unless explicitly whitelisted.

## What Are Tools?

Tools are capabilities that allow AI models to interact with your vault and the web:

- **Vault Search**: Search across your notes (you approve which files to share)
- **File Reading**: Read specific file contents (you select what to share)
- **Web Search**: Search the web via Brave Search API

**Privacy Guarantee**: All tool calls require your explicit approval at three layers:

1. Approve the tool execution request
2. Review the results before sharing with AI
3. Select exactly what data to share

See [v3.0.0 Release Notes](https://github.com/obsidian-chatgpt-md/obsidian-chatgpt-md) for details.

## Whitelist Coverage

The default whitelist includes **161 patterns** covering models from live API testing:

| Provider   | Patterns | Models Tested | Tool Support    |
| ---------- | -------- | ------------- | --------------- |
| OpenAI     | 36       | 119           | 56 models       |
| Anthropic  | 9        | 9             | 9 models (100%) |
| Gemini     | 7        | 29            | 7 models        |
| OpenRouter | 109      | 346           | 122 models      |

**Test Date**: 2026-02-01
**Total Tested**: 503 models
**Confirmed Tool Support**: 194 models (38.6%)

For complete test results, see [`scripts/tool-whitelist/tool-test-results.json`](../scripts/tool-whitelist/tool-test-results.json).

## Pattern Matching Syntax

The whitelist uses flexible pattern matching to handle model versioning:

### Exact Match

```
gpt-4o
```

Matches only `gpt-4o`

### Date Suffix Auto-Match

```
gpt-4o
```

Matches:

- `gpt-4o`
- `gpt-4o-2025-04-16`
- `gpt-4o-20251101`

Date suffixes are automatically matched, so you don't need to list every version.

### Wildcard Prefix

```
gpt-4*
```

Matches anything starting with `gpt-4`:

- `gpt-4`
- `gpt-4-turbo`
- `gpt-4o`
- `gpt-4o-mini`

### Comments

```
# This is a comment
gpt-4o
```

Lines starting with `#` are ignored.

## Configuration

### Via Settings UI

1. Open **Settings → ChatGPT MD → Tool Calling**
2. Find **Tool-Enabled Models** textarea
3. Add/remove patterns (one per line)
4. Click **Reset to Recommended** to restore default whitelist

### Via Note Frontmatter

Override the default whitelist per note:

```yaml
---
chatgpt-md:
  model: openai@gpt-4o
  enableToolCalling: true
  toolEnabledModels: |
    gpt-4o
    claude-3-5-sonnet
    deepseek-chat
---
```

## Adding Custom Models

### Testing a Model

Before adding a model to the whitelist, test if it actually supports tools:

1. Enable **Debug Mode** in settings
2. Set the model in a note
3. Send a message that would trigger tool use: `"Search my notes for"`
4. Check the console (Ctrl+Shift+I) for:
   - Tool calls in the API response
   - Errors like "does not support tools"

### Adding a Confirmed Model

If testing confirms tool support, add it to your whitelist:

```yaml
toolEnabledModels: |
  gpt-4o
  claude-3-5-sonnet
  my-custom-model  # Add here
```

### OpenRouter Models

OpenRouter models use `provider/model` format:

```
deepseek/deepseek-chat
anthropic/claude-3-5-sonnet
```

The whitelist handles this format automatically.

## Provider-Specific Guidance

### OpenAI

**Tool Support**: GPT-4 series, GPT-5 series, o-series

**No Tool Support**: GPT-3.5 and earlier (limited tool support)

```yaml
# Recommended OpenAI models
toolEnabledModels: |
  gpt-4o
  gpt-4o-mini
  gpt-5-mini
  o3
  o3-mini
```

### Anthropic (Claude)

**Tool Support**: All Claude 3, 3.5, 4, and 4.5 models (100% tested)

```yaml
# Recommended Anthropic models
toolEnabledModels: |
  claude-3-5-sonnet
  claude-3-5-haiku
  claude-opus-4-5
```

### Gemini

**Tool Support**: Flash 2.5 and Flash 3.0 preview models

```yaml
# Recommended Gemini models
toolEnabledModels: |
  gemini-2.5-flash
  gemini-flash-latest
  gemini-3-flash-preview
```

### OpenRouter

**Tool Support**: 109 confirmed patterns including:

- DeepSeek (V3, R1 series)
- Qwen (2.5, 3 series)
- Mistral (Large, Ministral)
- Meta Llama (3.1, 4)
- And many more

See the full list in the default whitelist.

### Local Models (Ollama, LM Studio)

**Caution**: Tool support varies significantly by implementation.

**Recommendation**: Test before whitelisting. Many local models claim tool support but have implementation issues.

```yaml
# Test carefully before adding
toolEnabledModels: |
  llama3.2
  mistral-7b
```

## Validation and Troubleshooting

### Check Your Models

Use the **WhitelistValidator** to see which of your configured models support tools:

```typescript
import { validateWhitelist } from "src/Services/WhitelistValidator";

const result = validateWhitelist(["gpt-4o", "claude-3-haiku", "unknown-model"], whitelist);

console.log(result.matchRate); // Percentage supporting tools
console.log(result.unmatchedModelDetails); // Models not on whitelist
```

### Common Issues

#### "Model doesn't support tools" error

**Cause**: Model returned an error when tools were in the API request.

**Solutions**:

1. Check if model is actually on whitelist
2. Try a confirmed model from default whitelist
3. Enable Debug Mode to see API response

#### Tools not offered when expected

**Cause**: Multiple possible reasons:

1. Tool calling disabled in settings
2. Model not on whitelist
3. Model doesn't understand it can use tools
4. No relevant tools for the query

**Solutions**:

1. Check `enableToolCalling` is on
2. Verify model is in whitelist
3. Try explicit query: "Search my notes for..."
4. Enable Debug Mode

#### OpenRouter models not matching

**Cause**: Whitelist needs full `provider/model` format.

**Solution**:

```yaml
# Correct
toolEnabledModels: |
  deepseek/deepseek-chat

# Incorrect
toolEnabledModels: |
  deepseek-chat
```

## Maintenance and Updates

### Automated Testing

The whitelist is generated from automated testing scripts in `/scripts`:

- `fetch-available-models.mjs` - Fetch model lists from APIs
- `test-models-tools.mjs` - Test each model for tool support
- `generate-whitelist.mjs` - Generate whitelist from test results
- `validate-tool-whitelist.mjs` - Validate whitelist patterns

See [`scripts/tool-whitelist/README-WHITELIST-MAINTENANCE.md`](../scripts/tool-whitelist/README-WHITELIST-MAINTENANCE.md) for details.

### Updating the Whitelist

When new models are released:

1. Run test scripts to confirm tool support
2. Update `scripts/tool-whitelist/generated-whitelist.txt`
3. Run `generate-whitelist.mjs` to create new whitelist
4. Update `ToolSupportDetector.ts:getDefaultToolWhitelist()`
5. Test with development build

### Contributing

If you test a model and confirm tool support:

1. Add to `scripts/tool-whitelist/generated-whitelist.txt`
2. Run validation scripts
3. Submit PR with test results

## Security Considerations

### Why a Whitelist?

Without a whitelist, any model could be used with tools, leading to:

1. **API Errors**: Models that don't understand tools return errors
2. **Unexpected Behavior**: Models might ignore tools or misuse them
3. **Privacy Risks**: Malicious models could exploit tool access

### Conservative Approach

The whitelist uses a **conservative inclusion policy**:

- **100% success rate** required for inclusion
- Models must consistently handle tool calls
- Edge cases and errors result in exclusion
- When in doubt, exclude the model

This ensures a reliable, safe user experience.

### Your Privacy

Tools are **opt-in only**:

- Disabled by default for all models
- Require explicit enablement in settings
- Three-layer approval for every tool call
- You control exactly what data is shared

No data is ever shared with the AI without your approval.

## Advanced Usage

### Pattern Optimization

Use wildcards to reduce whitelist size:

```yaml
# Instead of listing all versions
toolEnabledModels: |
  gpt-4o
  gpt-4o-2025-04-16
  gpt-4o-20251101
  gpt-4o-mini
  gpt-4o-mini-2025-04-16

# Use a single pattern
toolEnabledModels: |
  gpt-4o*
```

### Provider-Specific Whitelists

Different whitelists per provider:

```yaml
toolEnabledModels: |
  # OpenAI - production ready
  gpt-4o
  gpt-4o-mini

  # Anthropic - all Claude 4.5
  claude-*-4-5

  # OpenRouter - only tested models
  deepseek/deepseek-chat
  qwen/qwen-max
```

### Excluding Specific Models

Use the pattern matching creatively:

```yaml
# Allow all gpt-4o except specific version
toolEnabledModels: |
  gpt-4o*
  !gpt-4o-2025-01-01  # Exclude this specific date
```

Note: The `!` exclusion syntax is not currently supported. You must explicitly list only the models you want.

## FAQ

### Q: Why isn't my model on the whitelist?

**A**: The model either:

1. Hasn't been tested yet (new models added regularly)
2. Failed tool support testing (errors or inconsistent behavior)
3. Is too old and doesn't support modern tool calling

Test it yourself and add it if it works!

### Q: Can I use tools with local models?

**A**: Yes, but test carefully. Local model implementations vary significantly. Some claim tool support but have bugs or incomplete implementations.

### Q: How often is the whitelist updated?

**A**: The whitelist is updated when:

- Major providers release new models
- Community testing confirms additional models
- Bug reports indicate false positives/negatives

Check the test date in the whitelist header for last update.

### Q: What if a model stops supporting tools?

**A**: This is rare but possible. If you encounter this:

1. Enable Debug Mode to confirm the error
2. Remove the model from your whitelist
3. Report it as an issue

### Q: Can I disable the whitelist entirely?

**A**: Technically yes, by adding a wildcard pattern:

```yaml
toolEnabledModels: |
  *
```

**Not recommended**: This will cause errors with models that don't support tools.

## Resources

- **Testing Scripts**: [`scripts/tool-whitelist/`](../scripts/tool-whitelist/)
- **Test Results**: [`scripts/tool-whitelist/tool-test-results.json`](../scripts/tool-whitelist/tool-test-results.json)
- **Maintenance Guide**: [`scripts/tool-whitelist/README-WHITELIST-MAINTENANCE.md`](../scripts/tool-whitelist/README-WHITELIST-MAINTENANCE.md)
- **Source Code**: [`src/Services/ToolSupportDetector.ts`](../src/Services/ToolSupportDetector.ts)

## Support

For issues or questions:

1. Check this documentation first
2. Enable Debug Mode and check console
3. Review test results for your model
4. Open an issue on GitHub with:
   - Model ID
   - Provider (OpenAI, Anthropic, etc.)
   - Console error messages
   - Steps to reproduce
