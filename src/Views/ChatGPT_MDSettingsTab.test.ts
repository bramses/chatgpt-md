import { parseSettingValue } from "./ChatGPT_MDSettingsTab";
import { createSettingsSchema, SettingDefinition } from "./settingsSchema";
import { DEFAULT_SETTINGS } from "src/Models/Config";

function numericSetting(id: SettingDefinition["id"], name = "Value"): SettingDefinition {
  return { id, name, description: "", type: "text", valueType: "number", group: "Test" };
}

describe("credential settings schema", () => {
  it("associates all seven legacy fields with distinct reference fields", () => {
    const credentials = createSettingsSchema(DEFAULT_SETTINGS).filter((setting) => setting.type === "credential");

    expect(credentials).toHaveLength(7);
    expect(new Set(credentials.map((setting) => setting.id)).size).toBe(7);
    expect(new Set(credentials.map((setting) => setting.secretIdSetting)).size).toBe(7);
  });
});

describe("parseSettingValue", () => {
  it("parses finite numeric values", () => {
    expect(parseSettingValue(numericSetting("openaiDefaultMaxTokens"), "800")).toBe(800);
  });

  it("rejects empty and non-numeric values", () => {
    expect(() => parseSettingValue(numericSetting("openaiDefaultMaxTokens"), "")).toThrow("valid number");
    expect(() => parseSettingValue(numericSetting("openaiDefaultMaxTokens"), "abc")).toThrow("valid number");
  });

  it("enforces documented ranges", () => {
    expect(parseSettingValue(numericSetting("headingLevel", "Heading Level"), "6")).toBe(6);
    expect(() => parseSettingValue(numericSetting("headingLevel", "Heading Level"), "7")).toThrow("between 0 and 6");
    expect(() => parseSettingValue(numericSetting("maxWebSearchResults"), "0")).toThrow("between 1 and 10");
  });
});
