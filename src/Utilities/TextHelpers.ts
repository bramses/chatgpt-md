import {
  HORIZONTAL_LINE_MD,
  MAX_HEADING_LEVEL,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_DEVELOPER,
  ROLE_IDENTIFIER,
  ROLE_USER,
} from "src/Constants";

const cleanupRole = (role: string): string => {
  const trimmedRole = role.trim().toLowerCase();

  const roles = [ROLE_USER, ROLE_ASSISTANT, ROLE_DEVELOPER];

  const foundRole = roles.find((r) => trimmedRole.includes(r));

  if (foundRole) {
    return foundRole;
  }

  throw new Error(`Failed to extract role from input: "${role}"`);
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

    const cleanedRole = cleanupRole(roleSection);

    return {
      role: cleanedRole,
      content: contentSections.join("\n").trim(),
    };
  } catch (error) {
    throw new Error(`Failed to extract role and message: ${error}`);
  }
};

export const removeCommentsFromMessages = (message: string) => {
  try {
    const commentBlock = /=begin-chatgpt-md-comment[\s\S]*?=end-chatgpt-md-comment/g;

    // remove comment block
    return message.replace(commentBlock, "");
  } catch (err) {
    throw new Error("Error removing comments from messages" + err);
  }
};

export const getHeadingPrefix = (headingLevel: number) => {
  if (headingLevel === 0) {
    return "";
  } else if (headingLevel > MAX_HEADING_LEVEL) {
    return "#".repeat(MAX_HEADING_LEVEL) + " ";
  }
  return "#".repeat(headingLevel) + " ";
};

export const getHeaderRole = (headingPrefix: string, role: string, model?: string) =>
  `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}${headingPrefix}${ROLE_IDENTIFIER}${role}${model ? `<span style="font-size: small;"> (${model})</span>` : ``}${NEWLINE}`;

export const parseSettingsFrontmatter = (yamlString: string): Record<string, any> => {
  // Remove the --- markers and split into lines
  const content = yamlString.replace(/^---\n/, "").replace(/\n---$/, "");
  const lines = content.split("\n");
  const result: Record<string, any> = {};

  // Track multi-line array state
  let currentArrayKey: string | null = null;
  let currentArray: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) continue;

    // Check if we're inside a multi-line array
    if (currentArrayKey !== null) {
      // Check if this line is an array item (starts with a dash)
      if (line.startsWith("-")) {
        // Extract the value after the dash
        let itemValue = line.substring(1).trim();

        // Remove quotes if they exist
        if (
          (itemValue.startsWith("'") && itemValue.endsWith("'")) ||
          (itemValue.startsWith('"') && itemValue.endsWith('"'))
        ) {
          itemValue = itemValue.substring(1, itemValue.length - 1);
        }

        currentArray.push(itemValue);
        continue;
      } else {
        // End of array - store it in the result
        result[currentArrayKey] = currentArray;
        currentArrayKey = null;
        currentArray = [];
        // Don't continue - process this line normally
      }
    }

    // Split on first colon (but not if it's in quotes)
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue; // Skip invalid lines

    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    // Check for multi-line array start
    if (value === "" && i + 1 < lines.length && lines[i + 1].trim().startsWith("-")) {
      currentArrayKey = key;
      currentArray = [];
      continue;
    }

    // Parse the value
    if (value.startsWith("[") && value.endsWith("]")) {
      // Handle inline arrays
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => {
          const trimmed = item.trim();
          // Handle quoted strings in arrays
          if (
            (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
            (trimmed.startsWith('"') && trimmed.endsWith('"'))
          ) {
            return trimmed.slice(1, -1);
          }
          return trimmed;
        });
    } else if (value === "true") {
      result[key] = true;
    } else if (value === "false") {
      result[key] = false;
    } else if (value === "null") {
      result[key] = null;
    } else if (!isNaN(Number(value))) {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }

  // Handle case where file ends with an array
  if (currentArrayKey !== null) {
    result[currentArrayKey] = currentArray;
  }

  return result;
};

export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const splitMessages = (text: string | undefined): string[] => (text ? text.split(HORIZONTAL_LINE_MD) : []);

export const removeYAMLFrontMatter = (note: string | undefined): string | undefined => {
  if (!note) return note;

  // Check if the note starts with frontmatter
  if (!note.trim().startsWith("---")) {
    return note;
  }

  // Find the end of frontmatter
  const lines = note.split("\n");
  let endIndex = -1;

  // Skip first line (opening ---)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing ---, return original note
    return note;
  }

  // Return content after frontmatter
  return lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
};
