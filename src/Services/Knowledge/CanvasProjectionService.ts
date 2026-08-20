import { ConceptRecord } from "src/Models/Knowledge/KnowledgeImportManifest";
import { CapabilityFlags } from "src/Models/Knowledge/PluginCapability";
import { isSuppressedLifecycle } from "src/Models/Knowledge/Epistemics";
import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { PERSONAL_FOLDERS } from "./PersonalOntology";
import { joinPath, sanitizeNoteName, shortHashSafe } from "src/Utilities/KnowledgeText";

/**
 * Curated visual projections of the knowledge graph.
 *
 * Canvas is a core plugin, so this needs nothing installed - but it is still
 * strictly opt-in and strictly bounded. The vault is not mirrored into Canvas;
 * a few meaningful views are generated into one clearly marked folder, and only
 * files inside that folder are ever rewritten. A canvas you made or arranged by
 * hand elsewhere is never touched.
 */

export const MANAGED_CANVAS_FOLDER = joinPath(PERSONAL_FOLDERS.system, "Canvases");

interface CanvasNode {
  id: string;
  type: "file" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  file?: string;
  text?: string;
  color?: string;
}

interface CanvasFile {
  nodes: CanvasNode[];
  edges: Array<{ id: string; fromNode: string; toNode: string }>;
}

export interface CanvasProjection {
  name: string;
  description: string;
  select: (concepts: ConceptRecord[]) => ConceptRecord[];
}

const COLUMN_WIDTH = 420;
const ROW_HEIGHT = 320;
const PER_ROW = 4;

export const PROJECTIONS: CanvasProjection[] = [
  {
    name: "Patterns",
    description: "Durable patterns and the concepts around them.",
    select: (concepts) => concepts.filter((concept) => concept.path.startsWith(PERSONAL_FOLDERS.patterns)),
  },
  {
    name: "Dream Atlas",
    description: "Dreams and the symbols that recur across them.",
    select: (concepts) => concepts.filter((concept) => concept.path.startsWith("04 Dreams")),
  },
  {
    name: "Relationships",
    description: "People and the relationships around them.",
    select: (concepts) =>
      concepts.filter(
        (concept) => concept.path.startsWith(PERSONAL_FOLDERS.people) || concept.path.startsWith("05 Relationships")
      ),
  },
  {
    name: "Music Universe",
    description: "Music made, wanted, and listened to.",
    select: (concepts) => concepts.filter((concept) => concept.path.startsWith(PERSONAL_FOLDERS.music)),
  },
  {
    name: "Horizon",
    description: "Possibilities that have not happened yet.",
    select: (concepts) => concepts.filter((concept) => concept.path.startsWith(PERSONAL_FOLDERS.horizon)),
  },
];

export class CanvasProjectionService {
  constructor(private readonly manifest: ImportManifestService) {}

  /**
   * Generate the projections that actually have content.
   * Returns an empty list when Canvas is disabled in the destination vault.
   */
  async generate(store: KnowledgeFileStore, capabilities: CapabilityFlags, limitPerCanvas = 40): Promise<string[]> {
    if (!capabilities["visual-canvas"]) return [];

    const concepts = this.manifest
      .listConcepts()
      .filter((concept) => concept.vaultId === store.vaultId)
      .filter((concept) => !isSuppressedLifecycle(concept.lifecycle) && concept.surfaceInRetrieval !== false);

    const written: string[] = [];
    for (const projection of PROJECTIONS) {
      const selected = projection.select(concepts).slice(0, limitPerCanvas);
      if (selected.length === 0) continue;

      const path = joinPath(MANAGED_CANVAS_FOLDER, `${sanitizeNoteName(projection.name)}.canvas`);
      await store.write(path, JSON.stringify(this.buildCanvas(projection, selected), null, 2));
      written.push(path);
    }
    return written;
  }

  private buildCanvas(projection: CanvasProjection, concepts: ConceptRecord[]): CanvasFile {
    const nodes: CanvasNode[] = [
      {
        id: "generated-header",
        type: "text",
        x: 0,
        y: -ROW_HEIGHT,
        width: COLUMN_WIDTH * PER_ROW,
        height: 160,
        text:
          `# ${projection.name}\n\n${projection.description}\n\n` +
          "_Generated view. Regenerated on command, so positions here are not preserved. " +
          "Canvases outside this folder are never touched._",
      },
    ];

    concepts.forEach((concept, index) => {
      nodes.push({
        id: `note-${shortHashSafe(concept.path)}`,
        type: "file",
        file: concept.path,
        x: (index % PER_ROW) * COLUMN_WIDTH,
        y: Math.floor(index / PER_ROW) * ROW_HEIGHT,
        width: COLUMN_WIDTH - 20,
        height: ROW_HEIGHT - 20,
      });
    });

    return { nodes, edges: [] };
  }
}
