/**
 * Per-vault plugin capability model.
 *
 * Plugins are vault-local in Obsidian: the same plugin can be enabled in one
 * vault, installed but disabled in another, and absent from a third. This model
 * exists so the knowledge system can adapt its *optional* enhancements to the
 * destination vault, while the canonical Markdown it writes stays identical
 * everywhere.
 *
 * Nothing here ever installs, enables or configures a plugin. It observes.
 */

export type KnowledgeCapability =
  | "query-engine"
  | "full-text-search"
  | "semantic-search"
  | "tasks"
  | "task-notes"
  | "checklist"
  | "daily-notes"
  | "calendar"
  | "templates"
  | "quick-capture"
  | "visual-canvas"
  | "drawing"
  | "mind-map"
  | "outliner"
  | "tables"
  | "pdf-annotation"
  | "sync"
  | "git"
  | "ai-client"
  | "external-api"
  | "icons"
  | "highlighting"
  | "importer"
  | "homepage"
  | "spaces"
  | "terminal"
  | "backlinks"
  | "word-count";

export const KNOWLEDGE_CAPABILITIES: readonly KnowledgeCapability[] = [
  "query-engine",
  "full-text-search",
  "semantic-search",
  "tasks",
  "task-notes",
  "checklist",
  "daily-notes",
  "calendar",
  "templates",
  "quick-capture",
  "visual-canvas",
  "drawing",
  "mind-map",
  "outliner",
  "tables",
  "pdf-annotation",
  "sync",
  "git",
  "ai-client",
  "external-api",
  "icons",
  "highlighting",
  "importer",
  "homepage",
  "spaces",
  "terminal",
  "backlinks",
  "word-count",
];

/**
 * How the knowledge system talks to a plugin.
 *
 * `markdown-compatible` is deliberately the most common value: writing plain
 * Markdown that a plugin happens to understand creates no dependency at all.
 */
export type IntegrationMode =
  "native-api" | "command" | "markdown-compatible" | "filesystem" | "optional" | "unsupported";

export interface PluginCapability {
  pluginId: string;
  name: string;
  installed: boolean;
  enabled: boolean;
  version?: string;
  capabilities: KnowledgeCapability[];
  integrationMode: IntegrationMode;
  /** False when we know of no safe, documented way to interoperate. */
  safeToUse: boolean;
  notes?: string;
}

/** Capability flags for one vault. Absent capability means "write plain Markdown". */
export type CapabilityFlags = Record<KnowledgeCapability, boolean>;

export interface VaultCapabilityProfile {
  vaultId: string;
  vaultName: string;
  vaultPath: string;
  /** ISO timestamp of the last scan; profiles are cached, not rescanned per write. */
  scannedAt: string;
  /** True when the vault's `.obsidian` directory could actually be read. */
  inspected: boolean;
  plugins: PluginCapability[];
  capabilities: CapabilityFlags;
  /** Enabled core plugins, e.g. canvas, daily-notes, templates, backlink. */
  corePlugins: string[];
  /** Ids of enabled sync plugins; more than one is a conflict risk. */
  syncPlugins: string[];
  warnings: string[];
}

export function emptyCapabilityFlags(): CapabilityFlags {
  return Object.fromEntries(KNOWLEDGE_CAPABILITIES.map((capability) => [capability, false])) as CapabilityFlags;
}

interface KnownPlugin {
  name: string;
  capabilities: KnowledgeCapability[];
  integrationMode: IntegrationMode;
  safeToUse?: boolean;
  notes?: string;
}

/**
 * What each plugin is understood to *do*, and how we cooperate with it.
 *
 * Every entry answers one question: what role does this play in a knowledge
 * architecture? Plugins with no meaningful role are still recorded (so status
 * output is honest) but marked `optional` with no capabilities claimed.
 */
export const KNOWN_PLUGINS: Record<string, KnownPlugin> = {
  dataview: {
    name: "Dataview",
    capabilities: ["query-engine"],
    integrationMode: "markdown-compatible",
    notes: "Consistent frontmatter makes generated knowledge queryable. Dataview is never the canonical store.",
  },
  "obsidian-tasks-plugin": {
    name: "Tasks",
    capabilities: ["tasks"],
    integrationMode: "markdown-compatible",
    notes: "Action items stay plain checkboxes, which Tasks understands and plain Obsidian still renders.",
  },
  tasknotes: {
    name: "TaskNotes",
    capabilities: ["task-notes", "tasks"],
    integrationMode: "markdown-compatible",
    notes: "Richer task entities can link to knowledge notes; knowledge never depends on them.",
  },
  "obsidian-checklist-plugin": {
    name: "Checklist",
    capabilities: ["checklist"],
    integrationMode: "markdown-compatible",
    notes: "Reads the same checkbox syntax.",
  },
  "templater-obsidian": {
    name: "Templater",
    capabilities: ["templates"],
    integrationMode: "filesystem",
    notes: "Optional template files matching the generated schemas. Never executes template code on our behalf.",
  },
  quickadd: {
    name: "QuickAdd",
    capabilities: ["quick-capture"],
    integrationMode: "command",
    notes: "QuickAdd can call the plugin's capture commands; the commands also work without it.",
  },
  omnisearch: {
    name: "Omnisearch",
    capabilities: ["full-text-search"],
    integrationMode: "markdown-compatible",
    notes: "Clear titles, aliases and readable Markdown instead of machine blobs.",
  },
  "smart-connections": {
    name: "Smart Connections",
    capabilities: ["semantic-search"],
    integrationMode: "optional",
    notes: "Discovery only. Embedding similarity never merges concepts.",
  },
  calendar: {
    name: "Calendar",
    capabilities: ["calendar", "daily-notes"],
    integrationMode: "markdown-compatible",
    notes: "Navigation over dated notes; dates come from the sources themselves.",
  },
  "obsidian-excalidraw-plugin": {
    name: "Excalidraw",
    capabilities: ["drawing"],
    integrationMode: "markdown-compatible",
    notes: "Drawings are linked from notes, never generated automatically.",
  },
  "pdf-plus": {
    name: "PDF++",
    capabilities: ["pdf-annotation"],
    integrationMode: "markdown-compatible",
    notes: "Annotations can become provenance-carrying sources; author quotes stay separate from interpretation.",
  },
  "obsidian-git": {
    name: "Git",
    capabilities: ["git"],
    integrationMode: "optional",
    notes: "Versioning only. The knowledge system never commits or pushes vault content.",
  },
  "obsidian-livesync": {
    name: "Self-hosted LiveSync",
    capabilities: ["sync"],
    integrationMode: "optional",
    notes: "Bidirectional sync. Never configured or enabled by this plugin.",
  },
  "remotely-save": {
    name: "Remotely Save",
    capabilities: ["sync"],
    integrationMode: "optional",
    notes: "Bidirectional sync. Never configured or enabled by this plugin.",
  },
  "google-drive-sync": {
    name: "Google Drive Sync",
    capabilities: ["sync"],
    integrationMode: "optional",
    notes: "Bidirectional sync. Never configured or enabled by this plugin.",
  },
  "obsidian-local-rest-api": {
    name: "Local REST API",
    capabilities: ["external-api"],
    integrationMode: "optional",
    notes: "External control surface. The knowledge API is exposed in-process; no port is opened by this plugin.",
  },
  realclaudian: {
    name: "Claudian",
    capabilities: ["ai-client"],
    integrationMode: "markdown-compatible",
    notes: "Reads the vault as memory. Context entry notes are generated for it.",
  },
  copilot: {
    name: "Copilot",
    capabilities: ["ai-client"],
    integrationMode: "markdown-compatible",
    notes: "Same principle as Claudian: the vault is the memory, not the plugin.",
  },
  "obsidian-mind-map": {
    name: "Mind Map",
    capabilities: ["mind-map"],
    integrationMode: "markdown-compatible",
    notes: "Works from heading structure, so generated notes keep a sane heading hierarchy.",
  },
  "obsidian-markmind": {
    name: "MarkMind",
    capabilities: ["mind-map"],
    integrationMode: "markdown-compatible",
  },
  "obsidian-outliner": {
    name: "Outliner",
    capabilities: ["outliner"],
    integrationMode: "markdown-compatible",
    notes: "Generated lists stay cleanly nested.",
  },
  "table-editor-obsidian": {
    name: "Advanced Tables",
    capabilities: ["tables"],
    integrationMode: "markdown-compatible",
    notes: "Standard Markdown tables where tabular data genuinely helps.",
  },
  "obsidian-icon-folder": {
    name: "Iconize",
    capabilities: ["icons"],
    integrationMode: "markdown-compatible",
    notes: "Decoration only. Icons are never semantic identifiers.",
  },
  "highlightr-plugin": {
    name: "Highlightr",
    capabilities: ["highlighting"],
    integrationMode: "markdown-compatible",
    notes: "Human highlighting is preserved; generated merges never rewrite manual formatting.",
  },
  "obsidian-importer": {
    name: "Importer",
    capabilities: ["importer"],
    integrationMode: "filesystem",
    notes: "Imported Markdown can be fed to the semantic pipeline later, on request.",
  },
  homepage: {
    name: "Homepage",
    capabilities: ["homepage"],
    integrationMode: "optional",
    notes: "A recommended entry note is offered; the Homepage setting is never changed silently.",
  },
  "make-md": {
    name: "make.md",
    capabilities: ["spaces"],
    integrationMode: "optional",
    notes: "Navigation augmentation only. Knowledge never depends on proprietary metadata.",
  },
  terminal: {
    name: "Terminal",
    capabilities: ["terminal"],
    integrationMode: "optional",
    notes: "Convenience surface. No daemon is added and Obsidian works without it.",
  },
  "better-word-count": {
    name: "Better Word Count",
    capabilities: ["word-count"],
    integrationMode: "markdown-compatible",
    notes: "Generated content sits inside clearly marked managed blocks.",
  },
  "recent-files-obsidian": {
    name: "Recent Files",
    capabilities: [],
    integrationMode: "optional",
    notes: "Background writes never open notes in the UI, so the recent list stays useful.",
  },
  "editing-toolbar": { name: "Editing Toolbar", capabilities: [], integrationMode: "optional" },
  "obsidian-style-settings": { name: "Style Settings", capabilities: [], integrationMode: "optional" },
  "obsidian-minimal-settings": { name: "Minimal Theme Settings", capabilities: [], integrationMode: "optional" },
  "folder-notes": { name: "Folder Notes", capabilities: [], integrationMode: "optional" },
  "obsidian-book-search-plugin": {
    name: "Book Search",
    capabilities: [],
    integrationMode: "optional",
    notes: "Creates book notes; the media schema stays compatible with hand-made ones.",
  },
  "obsidian-reminder-plugin": { name: "Reminder", capabilities: [], integrationMode: "optional" },
  "obsidian-kanban": { name: "Kanban", capabilities: [], integrationMode: "optional" },
  "obsidian-day-planner": { name: "Day Planner", capabilities: [], integrationMode: "optional" },
  "tag-wrangler": { name: "Tag Wrangler", capabilities: [], integrationMode: "optional" },
};

/** Core plugin ids that matter to the knowledge system. */
export const CORE_CAPABILITY_MAP: Record<string, KnowledgeCapability> = {
  canvas: "visual-canvas",
  "daily-notes": "daily-notes",
  templates: "templates",
  backlink: "backlinks",
  "global-search": "full-text-search",
};

export function describePlugin(pluginId: string): KnownPlugin {
  return (
    KNOWN_PLUGINS[pluginId] || {
      name: pluginId,
      capabilities: [],
      integrationMode: "optional",
      safeToUse: false,
      notes: "Unknown plugin. Recorded for visibility; no integration is attempted.",
    }
  );
}
