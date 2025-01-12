import { HORIZONTAL_LINE_MD, ROLE_USER } from "src/Constants";

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
  const ROLE_IDENTIFIER = "role::";

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

export const isTitleTimestampFormat = (title: string, dateFormat: string) => {
  try {
    const pattern = generateDatePattern(dateFormat);

    return title.length == dateFormat.length && pattern.test(title);
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
