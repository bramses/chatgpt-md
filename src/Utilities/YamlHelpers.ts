/**
 * YAML/Frontmatter utility functions
 * Consolidated from TextHelpers and MessageHelpers
 */

/**
 * Remove YAML frontmatter from text
 * Returns content after the closing --- delimiter
 */
export function removeYAMLFrontMatter(note: string | undefined): string | undefined {
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
}

/**
 * Parse YAML frontmatter string into key-value object
 * Handles inline arrays, multi-line arrays, booleans, numbers, and strings
 */
export function parseSettingsFrontmatter(yamlString: string): Record<string, unknown> {
  // Remove the --- markers and split into lines
  const content = yamlString.replace(/^---\n/, "").replace(/\n---$/, "");
  const lines = content.split("\n");
  const result: Record<string, unknown> = {};

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
}

/**
 * Convert object back to YAML frontmatter string
 * @param obj Object to convert to YAML
 * @returns YAML frontmatter string including delimiter markers
 */
export function objectToYamlFrontmatter(obj: Record<string, unknown>): string {
  // Convert to YAML
  const frontmatterLines = Object.entries(obj).map(([key, value]) => {
    if (value === null || value === undefined) {
      return `${key}:`;
    }
    if (typeof value === "string") {
      return `${key}: "${value}"`;
    }
    if (Array.isArray(value)) {
      // Handle arrays - use inline format for simple arrays
      return `${key}: [${value.map((item) => `"${item}"`).join(", ")}]`;
    }
    return `${key}: ${value}`;
  });

  return `---\n${frontmatterLines.join("\n")}\n---\n`;
}
