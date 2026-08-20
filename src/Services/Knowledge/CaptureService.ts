import { CapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { DailyNoteService } from "./DailyNoteService";
import { PERSONAL_FOLDERS } from "./PersonalOntology";
import { VaultEnhancementService } from "./VaultEnhancementService";
import { joinPath, sanitizeNoteName, truncate, upsertFrontmatterFields } from "src/Utilities/KnowledgeText";

/**
 * Manual capture: the fast path from a thought to the same knowledge structure
 * the importer writes into.
 *
 * Two rules make this safe. First, manual captures are *traces* - they are
 * things the person actually wrote, so they are recorded evidence rather than
 * interpretation. Second, human authorship outranks everything: a captured note
 * is never rewritten by the importer, which appends to its own managed blocks
 * and leaves the rest alone.
 *
 * These commands exist with or without QuickAdd. QuickAdd, where present, can
 * bind to them like any other Obsidian command.
 */

export type CaptureKind =
  | "idea"
  | "dream"
  | "memory"
  | "person"
  | "song-idea"
  | "question"
  | "book"
  | "film"
  | "project-decision"
  | "learned"
  | "source-annotation";

interface CaptureDefinition {
  label: string;
  folder: string;
  type: string;
  layer: "trace" | "garden" | "horizon";
  /** Sections offered to the person. Never generated content. */
  sections: string[];
  extraFields?: Record<string, string[]>;
}

export const CAPTURE_DEFINITIONS: Record<CaptureKind, CaptureDefinition> = {
  idea: {
    label: "Idea",
    folder: PERSONAL_FOLDERS.lessons,
    type: "idea",
    layer: "trace",
    sections: ["What it is", "Why it interests me"],
  },
  dream: {
    label: "Dream",
    folder: PERSONAL_FOLDERS.dreams,
    type: "dream",
    layer: "trace",
    sections: ["Dream", "How it felt"],
    extraFields: { people: [], places: [], symbols: [], emotions: [], themes: [] },
  },
  memory: {
    label: "Memory",
    folder: PERSONAL_FOLDERS.experiences,
    type: "memory",
    layer: "trace",
    sections: ["What happened", "What I remember of it"],
  },
  person: {
    label: "Person",
    folder: PERSONAL_FOLDERS.people,
    type: "person",
    layer: "trace",
    sections: ["Relationship", "Shared experiences"],
    extraFields: { aliases: [] },
  },
  "song-idea": {
    label: "Song idea",
    folder: PERSONAL_FOLDERS.songIdeas,
    type: "music-idea",
    layer: "trace",
    sections: ["The idea", "References"],
  },
  question: {
    label: "Question",
    folder: PERSONAL_FOLDERS.questions,
    type: "question",
    layer: "trace",
    sections: ["The question", "Why it is open"],
  },
  book: {
    label: "Book",
    folder: PERSONAL_FOLDERS.books,
    type: "media",
    layer: "trace",
    sections: ["Why it matters to me", "Things to remember"],
  },
  film: {
    label: "Film",
    folder: PERSONAL_FOLDERS.films,
    type: "media",
    layer: "trace",
    sections: ["Why it matters to me", "Things to remember"],
  },
  "project-decision": {
    label: "Project decision",
    folder: "Decisions",
    type: "project-knowledge",
    layer: "trace",
    sections: ["The decision", "Why", "Consequences"],
  },
  learned: {
    label: "Something I learned",
    folder: PERSONAL_FOLDERS.knowledge,
    type: "knowledge",
    layer: "trace",
    sections: ["What I learned", "Where it came from"],
  },
  "source-annotation": {
    label: "Source annotation",
    folder: PERSONAL_FOLDERS.thingsToRemember,
    type: "source-annotation",
    layer: "trace",
    // The one distinction that must never blur: the author's words are not mine.
    sections: ["What the author said", "My reading of it"],
    extraFields: { source: [], page: [] },
  },
};

export interface CaptureRequest {
  kind: CaptureKind;
  title: string;
  body?: string;
  /** Free-form source reference, e.g. a PDF page or a URL. */
  source?: string;
  capabilities: CapabilityFlags;
}

export interface CaptureResult {
  path: string;
  created: boolean;
  dailyNotePath?: string | null;
}

export class CaptureService {
  constructor(
    private readonly dailyNotes: DailyNoteService = new DailyNoteService(),
    private readonly enhancements: VaultEnhancementService = new VaultEnhancementService(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async capture(store: KnowledgeFileStore, request: CaptureRequest): Promise<CaptureResult> {
    const definition = CAPTURE_DEFINITIONS[request.kind];
    const today = this.clock().toISOString().slice(0, 10);
    const title = request.title.trim() || `${definition.label} ${today}`;
    const name = request.kind === "dream" ? `Dream - ${today} - ${truncate(title, 60)}` : title;
    const path = joinPath(definition.folder, `${sanitizeNoteName(name)}.md`);

    const existing = await store.read(path);
    const content = existing ? this.append(existing, request, today) : this.scaffold(name, definition, request, today);

    const withFrontmatter = upsertFrontmatterFields(content, {
      type: definition.type,
      layer: definition.layer,
      epistemic_status: "recorded",
      // The importer checks this before it ever touches a note body.
      authored: "human",
      captured: today,
      ...(request.source ? { source: request.source } : {}),
      ...(existing ? {} : { created: today }),
    });

    const enhanced = this.enhancements.apply(
      withFrontmatter,
      { kind: "experience", layer: definition.layer } as never,
      { capabilities: request.capabilities, noteType: definition.type }
    );

    await store.write(path, enhanced);

    const dailyNotePath = await this.dailyNotes.recordKnowledge(
      store,
      request.capabilities,
      [{ path, title: name, kind: definition.label }],
      { createIfMissing: true }
    );

    return { path, created: existing === null, dailyNotePath };
  }

  private scaffold(title: string, definition: CaptureDefinition, request: CaptureRequest, today: string): string {
    const lines = [`# ${title}`, ""];
    definition.sections.forEach((section, index) => {
      lines.push(`## ${section}`, "");
      if (index === 0 && request.body?.trim()) lines.push(request.body.trim(), "");
      else lines.push("");
    });
    if (request.source) lines.push("## Source", "", request.source, "");
    lines.push(`_Captured ${today}._`, "");
    return lines.join("\n");
  }

  /** Existing captures are added to, never replaced. */
  private append(existing: string, request: CaptureRequest, today: string): string {
    if (!request.body?.trim()) return existing;
    const separator = existing.endsWith("\n") ? "" : "\n";
    return `${existing}${separator}\n### ${today}\n\n${request.body.trim()}\n`;
  }
}
