import { PRESERVE_ONLY_KINDS, SemanticUnit } from "src/Models/Knowledge/SemanticUnit";
import { GARDEN_CAVEAT, HORIZON_CAVEAT, isSuppressedLifecycle, TRACE_CAVEAT } from "src/Models/Knowledge/Epistemics";
import { RoutingDecision } from "./VaultRouterService";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { SemanticNoteResolver } from "./SemanticNoteResolver";
import { ImportManifestService } from "./ImportManifestService";
import { SourceDocument } from "./ConversationNormalizer";
import {
  BLOCK_APPEARANCES,
  BLOCK_AS_WRITTEN,
  BLOCK_DREAM,
  BLOCK_EVIDENCE,
  BLOCK_RELATED,
  BLOCK_SUMMARY,
  BLOCK_TENSION,
  headingFor,
  INTERPRETATION_DISCLAIMER,
  scaffoldFor,
  symbolScaffold,
} from "./NoteTemplates";
import { matchExistingFolder, PERSONAL_FOLDERS } from "./PersonalOntology";
import {
  EvidenceEntry,
  evidenceDateRange,
  evidenceIndependence,
  mergeEvidence,
  parseEvidenceBlock,
  renderEvidenceBlock,
  renderEvidenceLine,
} from "src/Utilities/EvidenceBlock";
import {
  FrontmatterValue,
  joinPath,
  readFrontmatterValue,
  obsidianUri,
  readManagedBlock,
  sanitizeNoteName,
  toWikiLink,
  truncate,
  upsertFrontmatterFields,
  upsertManagedBlock,
} from "src/Utilities/KnowledgeText";

/**
 * Writes the knowledge layer.
 *
 * Two invariants hold everywhere in this service:
 * - Human-authored content is never overwritten. Generated content only ever
 *   appears between managed markers, and only the keys we own are touched in
 *   frontmatter.
 * - Every generated statement carries provenance back to the archived source
 *   conversation, including across vault boundaries where wikilinks cannot go.
 */

export interface WriteContext {
  archiveVaultId: string;
  archiveVaultName: string;
  personalVaultId?: string;
  processingVersion: number;
  importedAt: string;
}

export interface ConversationRef {
  conversationId: string;
  title: string;
  date?: string;
  /** Path of the archived source note inside the archive vault. */
  sourcePath?: string;
}

export interface UnitWriteRequest {
  unit: SemanticUnit;
  decision: RoutingDecision;
  conversation: ConversationRef;
  store: KnowledgeFileStore;
  /** Folders that already exist in the destination vault. */
  existingFolders: string[];
}

export interface UnitWriteResult {
  paths: string[];
  primaryPath: string;
  created: boolean;
  /** True when new evidence arrived for a model the person had retired. */
  wasRetired: boolean;
}

export class KnowledgeWriterService {
  constructor(
    private readonly resolver: SemanticNoteResolver,
    private readonly manifest: ImportManifestService
  ) {}

  /** Layer A. Returns true when the archive note was created or changed. */
  async writeSource(store: KnowledgeFileStore, document: SourceDocument): Promise<boolean> {
    const existing = await store.read(document.path);
    if (existing === document.content) return false;
    await store.write(document.path, document.content);
    return true;
  }

  /** Flip `processed` in the archived source once semantics have been written. */
  async markSourceProcessed(store: KnowledgeFileStore, path: string, processingVersion: number): Promise<void> {
    const existing = await store.read(path);
    if (!existing) return;
    await store.write(
      path,
      upsertFrontmatterFields(existing, { processed: true, processing_version: processingVersion })
    );
  }

  async writeUnit(request: UnitWriteRequest, context: WriteContext): Promise<UnitWriteResult> {
    const { unit, decision, store } = request;
    const folder = decision.folder || PERSONAL_FOLDERS.uncategorized;
    const noteTitle = this.noteTitleFor(unit, request.conversation);

    const resolved = await this.resolver.resolve(unit, store.vaultId, folder, store, noteTitle);
    const stored = await store.read(resolved.path);
    const existing = stored ?? scaffoldFor(unit, resolved.title);
    // A model the person retired stays retired. The evidence is still kept -
    // nothing is discarded - but the note is not quietly reactivated.
    const wasRetired =
      isSuppressedLifecycle(readFrontmatterValue(existing, "status")) ||
      readFrontmatterValue(existing, "surface_in_retrieval") === "false";

    const sourceLink = this.sourceLink(request.conversation, store, context);
    const entry: EvidenceEntry = {
      unitId: unit.id,
      conversationId: request.conversation.conversationId,
      date: request.conversation.date,
      evidenceType: unit.evidenceType,
      origin: unit.origin,
      line: renderEvidenceLine({
        unitId: unit.id,
        conversationId: request.conversation.conversationId,
        date: request.conversation.date,
        text: unit.content,
        sourceLink,
        interpretation: unit.interpretation,
        evidenceType: unit.evidenceType,
        origin: unit.origin,
      }),
    };

    let content = existing;
    content = this.applyEvidence(content, entry, unit);
    content = this.applyKindBlocks(content, unit, request, context);
    // Fragments and strange connections are preserved, never interpreted, so
    // they get no themes, no related concepts and no reading of any kind.
    if (!unit.preserveOnly) content = this.applyRelated(content, unit);
    content = upsertFrontmatterFields(content, this.frontmatterFor(content, unit, request, context, wasRetired));

    await store.write(resolved.path, content);
    this.resolver.register(resolved, store.vaultId, unit.kind, unit.title, request.conversation.date, unit.layer);

    const extra = await this.writeDreamSymbols(request, context, resolved.path, resolved.title);
    return { paths: [resolved.path, ...extra], primaryPath: resolved.path, created: resolved.isNew, wasRetired };
  }

  /**
   * Low-confidence units are preserved, never guessed into a topical note.
   * They land in one dated inbox note plus the review queue.
   */
  async writeUncategorized(
    unit: SemanticUnit,
    conversation: ConversationRef,
    store: KnowledgeFileStore,
    context: WriteContext,
    reason: string
  ): Promise<string> {
    const path = joinPath(PERSONAL_FOLDERS.uncategorized, `${sanitizeNoteName(unit.title || "Unsorted")}.md`);
    const existing =
      (await store.read(path)) ??
      [`# ${unit.title || "Unsorted"}`, "", "_Not filed automatically: confidence was too low._", "", ""].join("\n");

    const entry: EvidenceEntry = {
      unitId: unit.id,
      conversationId: conversation.conversationId,
      date: conversation.date,
      evidenceType: unit.evidenceType,
      origin: unit.origin,
      line: renderEvidenceLine({
        unitId: unit.id,
        conversationId: conversation.conversationId,
        date: conversation.date,
        text: unit.content,
        sourceLink: this.sourceLink(conversation, store, context),
        interpretation: unit.interpretation,
        evidenceType: unit.evidenceType,
        origin: unit.origin,
      }),
    };

    let content = this.applyEvidence(existing, entry, unit);
    content = upsertFrontmatterFields(content, {
      type: "chatgpt-unsorted",
      kind: unit.kind,
      routing_reason: reason,
      generated_by: "chatgpt-md",
      source_conversations: this.mergeSourceConversations(content, conversation.conversationId),
    });
    await store.write(path, content);
    return path;
  }

  private applyEvidence(content: string, entry: EvidenceEntry, unit: SemanticUnit): string {
    const blockId = unit.kind === "contradiction" ? BLOCK_TENSION : BLOCK_EVIDENCE;
    const merged = mergeEvidence(parseEvidenceBlock(readManagedBlock(content, blockId)), [entry]);
    const body = `${LAYER_CAVEAT[unit.layer]}

${renderEvidenceBlock(merged)}`;
    return upsertManagedBlock(content, blockId, headingFor(blockId), body);
  }

  private applyRelated(content: string, unit: SemanticUnit): string {
    const links = [...new Set([...unit.concepts, ...(unit.symbols || [])])]
      .filter((concept) => concept.toLowerCase() !== unit.title.toLowerCase())
      .slice(0, 24);
    if (links.length === 0) return content;
    const body = links.map((concept) => `- ${toWikiLink(concept)}`).join("\n");
    return upsertManagedBlock(content, BLOCK_RELATED, headingFor(BLOCK_RELATED), body);
  }

  private applyKindBlocks(
    content: string,
    unit: SemanticUnit,
    request: UnitWriteRequest,
    context: WriteContext
  ): string {
    if (PRESERVE_ONLY_KINDS.includes(unit.kind)) {
      const body = [unit.content.trim(), "", "_Kept as written. No interpretation is offered or intended._"].join("\n");
      return upsertManagedBlock(content, BLOCK_AS_WRITTEN, headingFor(BLOCK_AS_WRITTEN), body);
    }
    if (unit.kind === "dream") return this.applyDreamBlocks(content, unit, request, context);
    if (unit.kind === "project-decision" || unit.kind === "project-knowledge") {
      return upsertManagedBlock(content, BLOCK_SUMMARY, headingFor(BLOCK_SUMMARY), truncate(unit.content, 600));
    }
    return content;
  }

  private applyDreamBlocks(
    content: string,
    unit: SemanticUnit,
    request: UnitWriteRequest,
    context: WriteContext
  ): string {
    const sections: string[] = [unit.content.trim()];

    if (unit.emotions?.length) {
      sections.push("", "**Emotional tone**", "", unit.emotions.map((emotion) => `- ${emotion}`).join("\n"));
    }
    if (unit.symbols?.length) {
      sections.push("", "**Symbols**", "", unit.symbols.map((symbol) => `- ${toWikiLink(symbol)}`).join("\n"));
    }
    if (unit.people?.length) {
      sections.push("", "**People**", "", unit.people.map((person) => `- ${toWikiLink(person)}`).join("\n"));
    }
    if (unit.places?.length) {
      sections.push("", "**Places**", "", unit.places.map((place) => `- ${place}`).join("\n"));
    }
    if (unit.concepts.length > 0) {
      sections.push(
        "",
        "**Possible themes**",
        "",
        INTERPRETATION_DISCLAIMER,
        "",
        unit.concepts.map((concept) => `- ${toWikiLink(concept)}`).join("\n")
      );
    }
    sections.push("", `_Source: ${this.sourceLink(request.conversation, request.store, context)}_`);

    return upsertManagedBlock(content, BLOCK_DREAM, headingFor(BLOCK_DREAM), sections.join("\n"));
  }

  /** Recurring dream symbols become their own notes and accumulate backlinks. */
  private async writeDreamSymbols(
    request: UnitWriteRequest,
    context: WriteContext,
    dreamPath: string,
    dreamTitle: string
  ): Promise<string[]> {
    const { unit, store } = request;
    if (unit.kind !== "dream" || !unit.symbols?.length) return [];

    const folder =
      matchExistingFolder(request.existingFolders, PERSONAL_FOLDERS.dreamSymbols) || PERSONAL_FOLDERS.dreamSymbols;
    const written: string[] = [];

    for (const symbol of unit.symbols.slice(0, 12)) {
      const path = joinPath(folder, `${sanitizeNoteName(symbol)}.md`);
      const existing = (await store.read(path)) ?? symbolScaffold(symbol);
      const entry: EvidenceEntry = {
        unitId: `${unit.id}-symbol`,
        conversationId: request.conversation.conversationId,
        date: request.conversation.date,
        line: renderEvidenceLine({
          unitId: `${unit.id}-symbol`,
          conversationId: request.conversation.conversationId,
          date: request.conversation.date,
          text: `appears in ${toWikiLink(dreamTitle)}`,
          sourceLink: undefined,
        }),
      };
      const merged = mergeEvidence(parseEvidenceBlock(readManagedBlock(existing, BLOCK_APPEARANCES)), [entry]);
      let content = upsertManagedBlock(
        existing,
        BLOCK_APPEARANCES,
        headingFor(BLOCK_APPEARANCES),
        renderEvidenceBlock(merged)
      );
      const range = evidenceDateRange(merged);
      content = upsertFrontmatterFields(content, {
        type: "dream-symbol",
        generated_by: "chatgpt-md",
        appearances: merged.length,
        first_observed: range.first,
        last_observed: range.last,
      });
      await store.write(path, content);
      written.push(path);
      void dreamPath;
    }
    return written;
  }

  private frontmatterFor(
    content: string,
    unit: SemanticUnit,
    request: UnitWriteRequest,
    context: WriteContext,
    wasRetired = false
  ): Record<string, FrontmatterValue> {
    const blockId = unit.kind === "contradiction" ? BLOCK_TENSION : BLOCK_EVIDENCE;
    const entries = parseEvidenceBlock(readManagedBlock(content, blockId));
    const range = evidenceDateRange(entries);
    const independence = evidenceIndependence(entries);
    const existingStatus = readFrontmatterValue(content, "status");

    const fields: Record<string, FrontmatterValue> = {
      type: this.frontmatterType(unit),
      ...epistemicFields(unit, entries, independence, existingStatus, wasRetired),
      generated_by: "chatgpt-md",
      processing_version: context.processingVersion,
      first_observed: range.first,
      last_observed: range.last,
      expires_for_review: unit.layer === "garden" ? reviewDate(range.last) : undefined,
      source_conversations: this.mergeSourceConversations(content, request.conversation.conversationId),
    };

    if (unit.kind === "dream") {
      fields.date = request.conversation.date || unit.occurredOn;
      fields.people = unit.people || [];
      fields.places = unit.places || [];
      fields.emotions = unit.emotions || [];
      fields.symbols = unit.symbols || [];
      fields.themes = unit.concepts;
    }

    if (unit.kind === "person") {
      fields.aliases = unit.entities.filter((entity) => entity.type === "person").map((entity) => entity.name);
    }

    if (unit.kind === "media") {
      const creator = unit.entities.find((entity) => entity.type === "artist" || entity.type === "person");
      if (creator) fields.creator = creator.name;
    }

    // Cross-vault provenance: wikilinks cannot leave a vault, so the archive
    // location is recorded as structured metadata instead.
    if (request.conversation.sourcePath && request.store.vaultId !== context.archiveVaultId) {
      fields.source_vault = context.archiveVaultName;
      fields.source_path = request.conversation.sourcePath;
    }

    return fields;
  }

  private frontmatterType(unit: SemanticUnit): string {
    switch (unit.kind) {
      case "horizon":
        return "horizon";
      case "experiment":
        return "lived-experiment";
      case "fragment":
        return "fragment";
      case "strange-connection":
        return "strange-connection";
      case "dream":
        return "dream";
      case "person":
        return "person";
      case "media":
        return "media";
      case "project-decision":
      case "project-knowledge":
        return "project-knowledge";
      default:
        return "concept";
    }
  }

  private mergeSourceConversations(content: string, conversationId: string): string[] {
    const existing = readListField(content, "source_conversations");
    return [...new Set([...existing, conversationId])].slice(0, 200);
  }

  private noteTitleFor(unit: SemanticUnit, conversation: ConversationRef): string {
    if (unit.kind !== "dream") return unit.title;
    const date = unit.occurredOn || conversation.date || "undated";
    return `Dream - ${date} - ${truncate(unit.title, 60)}`;
  }

  /** In-vault wikilink, or an obsidian:// link when the archive is elsewhere. */
  private sourceLink(conversation: ConversationRef, store: KnowledgeFileStore, context: WriteContext): string {
    if (!conversation.sourcePath) return `ChatGPT conversation ${conversation.conversationId}`;
    const label = truncate(conversation.title || "ChatGPT conversation", 60);
    if (store.vaultId === context.archiveVaultId) {
      return `[[${conversation.sourcePath.replace(/\.md$/i, "")}|${label}]]`;
    }
    return `[${label} (in ${context.archiveVaultName})](${obsidianUri(context.archiveVaultName, conversation.sourcePath)})`;
  }
}

/**
 * How much this note actually rests on, and how it should be read.
 * Kept as data in frontmatter so Dataview queries and the person can both see
 * the difference between a recorded trace and a provisional reading.
 */
function epistemicFields(
  unit: SemanticUnit,
  entries: EvidenceEntry[],
  independence: ReturnType<typeof evidenceIndependence>,
  existingStatus: string | undefined,
  wasRetired: boolean
): Record<string, FrontmatterValue> {
  return {
    layer: unit.layer,
    // Interpretation is always provisional and always dated, so a reading of
    // one period can never be mistaken for a description of the person.
    epistemic_status: EPISTEMIC_STATUS[unit.layer],
    status: wasRetired
      ? existingStatus || "retired"
      : existingStatus || (independence.episodes > 1 ? "active" : "emerging"),
    surface_in_retrieval: wasRetired ? false : undefined,
    evidence_kinds: [...new Set(entries.map((entry) => entry.evidenceType || "unspecified"))],
    independent_sources: independence.conversations,
    reflection_episodes: independence.episodes,
    assistant_originated_evidence: independence.assistantOriginated,
  };
}

const EPISTEMIC_STATUS: Record<string, string> = {
  trace: "recorded",
  garden: "provisional",
  horizon: "possibility",
};

const LAYER_CAVEAT: Record<string, string> = {
  trace: TRACE_CAVEAT,
  garden: GARDEN_CAVEAT,
  horizon: HORIZON_CAVEAT,
};

/** Interpretations get a review date so they visibly age instead of hardening. */
const REVIEW_INTERVAL_DAYS = 180;

function reviewDate(lastObserved?: string): string | undefined {
  const base = lastObserved ? Date.parse(`${lastObserved}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(base)) return undefined;
  return new Date(base + REVIEW_INTERVAL_DAYS * 86400000).toISOString().slice(0, 10);
}

function readListField(content: string, key: string): string[] {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!match) return [];
  const inline = match[1].trim();
  if (inline.startsWith("[")) {
    return inline
      .slice(1, -1)
      .split(",")
      .map((value) => value.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  const lines = content.split("\n");
  const index = lines.findIndex((line) => line.startsWith(`${key}:`));
  const values: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (!/^\s*-\s+/.test(line)) break;
    values.push(
      line
        .replace(/^\s*-\s+/, "")
        .replace(/^["']|["']$/g, "")
        .trim()
    );
  }
  return values.filter(Boolean);
}
