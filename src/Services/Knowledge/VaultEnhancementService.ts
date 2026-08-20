import { SemanticUnit } from "src/Models/Knowledge/SemanticUnit";
import { CapabilityFlags, emptyCapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { FrontmatterValue, upsertFrontmatterFields } from "src/Utilities/KnowledgeText";

/**
 * Optional, destination-specific enhancements.
 *
 * Everything here is additive and removable. The canonical note - frontmatter,
 * wikilinks, provenance, evidence - is written before any of this runs and is
 * byte-identical whether the destination vault has thirty plugins or none. If a
 * plugin is later disabled or uninstalled, what remains is still a complete,
 * readable Markdown note.
 *
 * The rule: no enhancement may be load-bearing.
 */

/** Iconize decoration only. Icons are never semantic identifiers. */
const TYPE_ICONS: Record<string, string> = {
  dream: "LiMoon",
  person: "LiUser",
  media: "LiBookOpen",
  concept: "LiBrain",
  horizon: "LiSunrise",
  fragment: "LiFeather",
  "strange-connection": "LiShuffle",
  "lived-experiment": "LiFlaskConical",
  "project-knowledge": "LiFolderKanban",
};

export interface EnhancementContext {
  capabilities: CapabilityFlags;
  /** Note type as written into frontmatter. */
  noteType: string;
}

export class VaultEnhancementService {
  /**
   * Apply what this vault can actually use. With no capabilities, the content
   * is returned untouched.
   */
  apply(content: string, unit: SemanticUnit, context: EnhancementContext): string {
    let enhanced = content;

    if (context.capabilities.icons) {
      enhanced = this.applyIcon(enhanced, context.noteType);
    }

    void unit;
    return enhanced;
  }

  private applyIcon(content: string, noteType: string): string {
    const icon = TYPE_ICONS[noteType];
    if (!icon) return content;
    const fields: Record<string, FrontmatterValue> = { icon };
    return upsertFrontmatterFields(content, fields);
  }

  /**
   * A block listing open actions.
   *
   * With the Tasks plugin a live query is far more useful; without it the same
   * information is written as a static list of links, so the section never
   * turns into an unrendered code block for someone with plain Obsidian.
   */
  renderActionsBlock(capabilities: CapabilityFlags, noteTitle: string, staticItems: string[]): string {
    if (capabilities.tasks) {
      return [
        "```tasks",
        "not done",
        `path includes ${noteTitle}`,
        "short mode",
        "```",
        "",
        "_Live query (Tasks plugin). The checkboxes themselves are plain Markdown._",
      ].join("\n");
    }

    return staticItems.length > 0
      ? staticItems.map((item) => `- [ ] ${item}`).join("\n")
      : "_No actions recorded. Add plain `- [ ]` checkboxes here._";
  }

  /**
   * An index section: a Dataview query where Dataview exists, otherwise the
   * pre-computed list the knowledge system generated anyway.
   */
  renderQuerySection(
    capabilities: CapabilityFlags,
    query: { from: string; where?: string; sort?: string; columns?: string },
    fallback: string
  ): string {
    if (!capabilities["query-engine"]) return fallback;

    const lines = [
      "```dataview",
      `TABLE ${query.columns || 'first_observed AS "First", last_observed AS "Last", status AS "Status"'}`,
      `FROM ${query.from}`,
    ];
    if (query.where) lines.push(`WHERE ${query.where}`);
    lines.push(`SORT ${query.sort || "last_observed DESC"}`);
    lines.push("```");
    lines.push("");
    lines.push("_Live query (Dataview). The same information is in the generated list below if Dataview is removed._");
    lines.push("");
    lines.push(fallback);
    return lines.join("\n");
  }
}

export function capabilitiesOrDefault(capabilities?: CapabilityFlags): CapabilityFlags {
  return capabilities ?? emptyCapabilityFlags();
}
