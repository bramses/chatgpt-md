import {
  buildModelId,
  getApiUrlsFromFrontmatter,
  getDefaultConfigForService,
  getDefaultModelForService,
  isTitleTimestampFormat,
} from "./FrontmatterHelpers";
import {
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_GEMINI,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
} from "src/Constants";

describe("getDefaultConfigForService", () => {
  it("returns OpenAI config for openai", () => {
    const config = getDefaultConfigForService(AI_SERVICE_OPENAI);
    expect(config.aiService).toBe("openai");
    expect(config.url).toContain("openai.com");
  });

  it("returns Anthropic config for anthropic", () => {
    const config = getDefaultConfigForService(AI_SERVICE_ANTHROPIC);
    expect(config.aiService).toBe("anthropic");
    expect(config.url).toContain("anthropic.com");
  });

  it("returns Gemini config for gemini", () => {
    const config = getDefaultConfigForService(AI_SERVICE_GEMINI);
    expect(config.aiService).toBe("gemini");
  });

  it("returns Ollama config for ollama", () => {
    const config = getDefaultConfigForService(AI_SERVICE_OLLAMA);
    expect(config.aiService).toBe("ollama");
    expect(config.url).toContain("localhost");
  });

  it("returns OpenRouter config for openrouter", () => {
    const config = getDefaultConfigForService(AI_SERVICE_OPENROUTER);
    expect(config.aiService).toBe("openrouter");
    expect(config.url).toContain("openrouter.ai");
  });

  it("returns LM Studio config for lmstudio", () => {
    const config = getDefaultConfigForService(AI_SERVICE_LMSTUDIO);
    expect(config.aiService).toBe("lmstudio");
    expect(config.url).toContain("localhost");
  });

  it("defaults to OpenAI for unknown service", () => {
    const config = getDefaultConfigForService("unknown");
    expect(config.aiService).toBe("openai");
  });

  it("defaults to OpenAI for empty string", () => {
    const config = getDefaultConfigForService("");
    expect(config.aiService).toBe("openai");
  });
});

describe("getDefaultModelForService", () => {
  it("returns default model for OpenAI", () => {
    const model = getDefaultModelForService(AI_SERVICE_OPENAI);
    expect(model).toBeTruthy();
    expect(typeof model).toBe("string");
  });

  it("returns default model for Anthropic", () => {
    const model = getDefaultModelForService(AI_SERVICE_ANTHROPIC);
    expect(model).toBeTruthy();
    expect(typeof model).toBe("string");
  });

  it("returns default model for Gemini", () => {
    const model = getDefaultModelForService(AI_SERVICE_GEMINI);
    expect(model).toBeTruthy();
    expect(typeof model).toBe("string");
  });

  it("returns default model for unknown service", () => {
    const model = getDefaultModelForService("unknown");
    expect(typeof model).toBe("string");
  });
});

describe("isTitleTimestampFormat", () => {
  it("matches timestamp format YYYYMMDDhhmmss", () => {
    expect(isTitleTimestampFormat("20240208153045", "YYYYMMDDhhmmss")).toBe(true);
  });

  it("matches timestamp format YYYY-MM-DD", () => {
    expect(isTitleTimestampFormat("2024-02-08", "YYYY-MM-DD")).toBe(true);
  });

  it("matches timestamp format YYYY/MM/DD", () => {
    expect(isTitleTimestampFormat("2024/02/08", "YYYY/MM/DD")).toBe(true);
  });

  it("matches timestamp format YYYY-MM-DD hh:mm", () => {
    expect(isTitleTimestampFormat("2024-02-08 15:30", "YYYY-MM-DD hh:mm")).toBe(true);
  });

  it("rejects non-matching format", () => {
    expect(isTitleTimestampFormat("My Note Title", "YYYYMMDDhhmmss")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isTitleTimestampFormat("2024", "YYYYMMDDhhmmss")).toBe(false);
  });

  it("rejects invalid timestamp", () => {
    expect(isTitleTimestampFormat("abcd-ef-gh", "YYYY-MM-DD")).toBe(false);
  });

  it("handles empty title", () => {
    expect(isTitleTimestampFormat("", "YYYY-MM-DD")).toBe(false);
  });

  it("handles empty format", () => {
    expect(isTitleTimestampFormat("2024-02-08", "")).toBe(false);
  });

  it("handles both empty", () => {
    expect(isTitleTimestampFormat("", "")).toBe(false);
  });

  it("handles undefined title", () => {
    expect(isTitleTimestampFormat(undefined, "YYYY-MM-DD")).toBe(false);
  });

  it("rejects partial match", () => {
    expect(isTitleTimestampFormat("2024-02-0", "YYYY-MM-DD")).toBe(false);
  });

  it("rejects longer string with correct prefix", () => {
    expect(isTitleTimestampFormat("2024-02-08-extra", "YYYY-MM-DD")).toBe(false);
  });
});

describe("buildModelId", () => {
  it("adds provider prefix to model without prefix", () => {
    expect(buildModelId("gpt-4", "openai")).toBe("openai@gpt-4");
  });

  it("does not add prefix if already present", () => {
    expect(buildModelId("openai@gpt-4", "openai")).toBe("openai@gpt-4");
  });

  it("handles different providers", () => {
    expect(buildModelId("claude-3", "anthropic")).toBe("anthropic@claude-3");
  });

  it("preserves existing prefix from different provider", () => {
    expect(buildModelId("openai@gpt-4", "anthropic")).toBe("openai@gpt-4");
  });

  it("handles empty model", () => {
    expect(buildModelId("", "openai")).toBe("openai@");
  });
});

describe("getApiUrlsFromFrontmatter", () => {
  it("returns default URLs when frontmatter is empty", () => {
    const urls = getApiUrlsFromFrontmatter({});
    expect(urls[AI_SERVICE_OPENAI]).toContain("openai.com");
    expect(urls[AI_SERVICE_ANTHROPIC]).toContain("anthropic.com");
    expect(urls[AI_SERVICE_OLLAMA]).toContain("localhost");
  });

  it("overrides OpenAI URL from frontmatter", () => {
    const frontmatter = { openaiUrl: "https://custom.openai.url" };
    const urls = getApiUrlsFromFrontmatter(frontmatter);
    expect(urls[AI_SERVICE_OPENAI]).toBe("https://custom.openai.url");
  });

  it("overrides Anthropic URL from frontmatter", () => {
    const frontmatter = { anthropicUrl: "https://custom.anthropic.url" };
    const urls = getApiUrlsFromFrontmatter(frontmatter);
    expect(urls[AI_SERVICE_ANTHROPIC]).toBe("https://custom.anthropic.url");
  });

  it("overrides multiple URLs from frontmatter", () => {
    const frontmatter = {
      openaiUrl: "https://custom.openai.url",
      anthropicUrl: "https://custom.anthropic.url",
    };
    const urls = getApiUrlsFromFrontmatter(frontmatter);
    expect(urls[AI_SERVICE_OPENAI]).toBe("https://custom.openai.url");
    expect(urls[AI_SERVICE_ANTHROPIC]).toBe("https://custom.anthropic.url");
  });

  it("returns URLs for all services", () => {
    const urls = getApiUrlsFromFrontmatter({});
    expect(urls).toHaveProperty(AI_SERVICE_OPENAI);
    expect(urls).toHaveProperty(AI_SERVICE_ANTHROPIC);
    expect(urls).toHaveProperty(AI_SERVICE_GEMINI);
    expect(urls).toHaveProperty(AI_SERVICE_OLLAMA);
    expect(urls).toHaveProperty(AI_SERVICE_OPENROUTER);
    expect(urls).toHaveProperty(AI_SERVICE_LMSTUDIO);
  });
});
