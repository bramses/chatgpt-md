import { CapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { joinPath } from "src/Utilities/KnowledgeText";

/**
 * Templates that match what the importer generates.
 *
 * The point is that a note you create by hand and a note the importer creates
 * have the same shape, so Dataview queries, indexes and links work across both.
 *
 * Installed only when explicitly asked for, never on startup, and never
 * overwriting an existing template. Where Templater is enabled the templates
 * use its date syntax; otherwise they carry plain placeholders, because a
 * template full of unevaluated `<% %>` is worse than no template at all.
 */

export const TEMPLATE_FOLDER = "99 System/Templates";

interface TemplateDefinition {
  name: string;
  frontmatter: string[];
  sections: string[];
}

const TEMPLATES: TemplateDefinition[] = [
  {
    name: "Dream",
    frontmatter: [
      "type: dream",
      "layer: trace",
      "date: {{date}}",
      "people: []",
      "places: []",
      "symbols: []",
      "emotions: []",
      "themes: []",
    ],
    sections: ["Dream", "How it felt", "Symbols", "People", "Possible themes"],
  },
  {
    name: "Person",
    frontmatter: ["type: person", "layer: trace", "relationship:", "aliases: []", "first_appearance: {{date}}"],
    sections: ["Relationship", "Shared experiences", "Themes", "Relevant moments"],
  },
  {
    name: "Pattern",
    frontmatter: [
      "type: concept",
      "layer: garden",
      "epistemic_status: provisional",
      "status: emerging",
      "first_observed: {{date}}",
      "last_observed: {{date}}",
    ],
    sections: ["What I mean by this", "How it appears in my life", "Changes over time", "Related"],
  },
  {
    name: "Idea",
    frontmatter: ["type: idea", "layer: trace", "captured: {{date}}"],
    sections: ["What it is", "Why it interests me", "Next"],
  },
  {
    name: "Question",
    frontmatter: ["type: question", "layer: trace", "captured: {{date}}"],
    sections: ["The question", "Why it is open", "What would answer it"],
  },
  {
    name: "Book",
    frontmatter: ["type: media", "creator:", "year:", "status: reading", "captured: {{date}}"],
    sections: ["Why it matters to me", "Things to remember", "Connections"],
  },
  {
    name: "Film",
    frontmatter: ["type: media", "creator:", "year:", "status: watched", "captured: {{date}}"],
    sections: ["Why it matters to me", "Things to remember", "Connections"],
  },
  {
    name: "Album",
    frontmatter: ["type: media", "creator:", "year:", "captured: {{date}}"],
    sections: ["Why it matters to me", "Sound", "Connections"],
  },
  {
    name: "Artist",
    frontmatter: ["type: media", "captured: {{date}}"],
    sections: ["Why they matter to me", "References", "Connections"],
  },
  {
    name: "Place",
    frontmatter: ["type: place", "layer: trace", "captured: {{date}}"],
    sections: ["What it is like", "What happened there"],
  },
  {
    name: "Memory",
    frontmatter: ["type: memory", "layer: trace", "date: {{date}}"],
    sections: ["What happened", "What I remember of it"],
  },
  {
    name: "Turning Point",
    frontmatter: ["type: turning-point", "layer: trace", "date: {{date}}"],
    sections: ["What changed", "What it followed", "What it made possible"],
  },
  {
    name: "Project Decision",
    frontmatter: [
      "type: project-knowledge",
      "project:",
      "topic:",
      "decision_status: decided",
      "first_observed: {{date}}",
      "last_observed: {{date}}",
    ],
    sections: ["The decision", "Why", "Consequences", "Actions"],
  },
  {
    name: "Research Note",
    frontmatter: ["type: source-annotation", "layer: trace", "source:", "page:", "captured: {{date}}"],
    sections: ["What the author said", "My reading of it"],
  },
  {
    name: "Daily Reflection",
    frontmatter: ["type: reflection", "layer: trace", "date: {{date}}"],
    sections: ["What happened", "What I noticed", "Open"],
  },
  {
    name: "Conversation Source",
    frontmatter: ["type: chatgpt-source", "conversation_id:", "created: {{date}}", "source: manual"],
    sections: ["User", "Assistant"],
  },
];

export class KnowledgeTemplateService {
  /** Writes only the templates that do not exist yet. Returns what was created. */
  async install(store: KnowledgeFileStore, capabilities: CapabilityFlags, folder = TEMPLATE_FOLDER): Promise<string[]> {
    const created: string[] = [];

    for (const template of TEMPLATES) {
      const path = joinPath(folder, `${template.name}.md`);
      if (await store.exists(path)) continue;
      await store.write(path, this.render(template, capabilities));
      created.push(path);
    }

    return created;
  }

  private render(template: TemplateDefinition, capabilities: CapabilityFlags): string {
    const date = capabilities.templates ? '<% tp.date.now("YYYY-MM-DD") %>' : "YYYY-MM-DD";
    const frontmatter = template.frontmatter.map((line) => line.replace("{{date}}", date));

    return [
      "---",
      ...frontmatter,
      "authored: human",
      "---",
      "",
      `# ${capabilities.templates ? "<% tp.file.title %>" : template.name}`,
      "",
      ...template.sections.flatMap((section) => [`## ${section}`, "", ""]),
    ].join("\n");
  }

  /** What the importer writes, so a person can check the shapes match. */
  describeSchemas(): string[] {
    return TEMPLATES.map((template) => `${template.name}: ${template.frontmatter[0].replace("type: ", "type=")}`);
  }
}
