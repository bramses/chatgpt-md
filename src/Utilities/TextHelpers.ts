import { HORIZONTAL_LINE_MD, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";

export const unfinishedCodeBlock = (txt: string): boolean => {
  const codeBlockMatches = txt.match(/```/g) || [];
  const isUnclosed = codeBlockMatches.length % 2 !== 0;

  if (isUnclosed) {
    console.log("[ChatGPT MD] Unclosed code block detected");
  }

  return isUnclosed;
};

export const splitMessages = (text: string) => {
  try {
    return text.split(HORIZONTAL_LINE_MD);
  } catch (err) {
    throw new Error("Error splitting messages" + err);
  }
};

export const removeYAMLFrontMatter = (message: string) => {
  if (!message) {
    return message;
  }

  const YAML_FRONT_MATTER_PATTERN = /---\s*[\s\S]*?\s*---/g;

  try {
    return message.replace(YAML_FRONT_MATTER_PATTERN, "").trim();
  } catch (error) {
    throw new Error(`Failed to remove YAML Front Matter: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
};

export const extractRoleAndMessage = (message: string) => {
  try {
    if (!message.includes(ROLE_IDENTIFIER)) {
      return {
        role: ROLE_USER,
        content: message,
      };
    }

    const [roleSection, ...contentSections] = message.split(ROLE_IDENTIFIER)[1].split("\n");

    return {
      role: roleSection.trim(),
      content: contentSections.join("\n").trim(),
    };
  } catch (error) {
    throw new Error(`Failed to extract role and message: ${error}`);
  }
};

export const removeCommentsFromMessages = (message: string) => {
  try {
    // comment block in form of =begin-chatgpt-md-comment and =end-chatgpt-md-comment
    const commentBlock = /=begin-chatgpt-md-comment[\s\S]*?=end-chatgpt-md-comment/g;

    // remove comment block
    const newMessage = message.replace(commentBlock, "");

    return newMessage;
  } catch (err) {
    throw new Error("Error removing comments from messages" + err);
  }
};

const generateDatePattern = (format: string) => {
  const pattern = format
    .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") // Escape any special characters
    .replace("YYYY", "\\d{4}") // Match exactly four digits for the year
    .replace("MM", "\\d{2}") // Match exactly two digits for the month
    .replace("DD", "\\d{2}") // Match exactly two digits for the day
    .replace("hh", "\\d{2}") // Match exactly two digits for the hour
    .replace("mm", "\\d{2}") // Match exactly two digits for the minute
    .replace("ss", "\\d{2}"); // Match exactly two digits for the second

  return new RegExp(`^${pattern}$`);
};

export const isTitleTimestampFormat = (title: string | undefined, dateFormat: string) => {
  try {
    const pattern = generateDatePattern(dateFormat);

    return title?.length == dateFormat.length && pattern.test(title);
  } catch (err) {
    throw new Error("Error checking if title is in timestamp format" + err);
  }
};

export const getHeadingPrefix = (headingLevel: number) => {
  if (headingLevel === 0) {
    return "";
  } else if (headingLevel > 6) {
    return "#".repeat(6) + " ";
  }
  return "#".repeat(headingLevel) + " ";
};

export const parseSettingsFrontmatter = (yamlString: string): Record<string, any> => {
  // Remove the --- markers and split into lines
  const content = yamlString.replace(/^---\n/, "").replace(/\n---$/, "");
  const lines = content.split("\n");
  const result: Record<string, any> = {};

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;

    // Split on first colon
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();

    // Parse the value
    if (value.startsWith("[") && value.endsWith("]")) {
      // Handle arrays
      result[key.trim()] = value
        .slice(1, -1)
        .split(",")
        .map((item) => {
          const trimmed = item.trim();
          // Handle quoted strings in arrays
          if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
            return trimmed.slice(1, -1);
          }
          return trimmed;
        });
    } else if (value === "true") {
      result[key.trim()] = true;
    } else if (value === "false") {
      result[key.trim()] = false;
    } else if (value === "null") {
      result[key.trim()] = null;
    } else if (!isNaN(Number(value))) {
      result[key.trim()] = Number(value);
    } else {
      result[key.trim()] = value;
    }
  }

  return result;
};
