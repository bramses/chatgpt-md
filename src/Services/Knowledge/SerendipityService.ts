import { ConceptRecord } from "src/Models/Knowledge/KnowledgeImportManifest";
import { isSuppressedLifecycle } from "src/Models/Knowledge/Epistemics";
import { ImportManifestService } from "./ImportManifestService";
import { KnowledgeFileStore } from "./KnowledgeFileStore";
import { PERSONAL_FOLDERS } from "./PersonalOntology";
import {
  joinPath,
  sanitizeNoteName,
  toWikiLink,
  upsertFrontmatterFields,
  upsertManagedBlock,
} from "src/Utilities/KnowledgeText";

/**
 * Random access to a life.
 *
 * Relevance-based retrieval always returns what already fits the current story,
 * which is how an archive becomes a bubble. These functions deliberately reach
 * for the old, the distant and the forgotten instead: things that no longer get
 * retrieved, ideas that were dropped, connections nothing justifies yet.
 */

export type RandomSource = () => number;

export interface ForgottenPick {
  concept: ConceptRecord;
  ageDays: number;
  reason: string;
}

const DAY = 86400000;

function ageInDays(lastObserved: string | undefined, now: number): number {
  if (!lastObserved) return 9999;
  const parsed = Date.parse(`${lastObserved}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((now - parsed) / DAY)) : 9999;
}

/**
 * Weighted sampling that favours age and rarity, with real randomness on top.
 * The point is temporal depth: reintroducing abandoned interests, people,
 * questions and ideas rather than confirming this month's preoccupations.
 */
export function pickForgotten(
  concepts: ConceptRecord[],
  count: number,
  now: number,
  random: RandomSource
): ForgottenPick[] {
  const eligible = concepts
    .filter((concept) => !isSuppressedLifecycle(concept.lifecycle))
    .map((concept) => ({ concept, ageDays: ageInDays(concept.lastObserved, now) }))
    .filter((entry) => entry.ageDays >= 60);

  if (eligible.length === 0) return [];

  const picks: ForgottenPick[] = [];
  const pool = [...eligible];

  while (picks.length < count && pool.length > 0) {
    const weights = pool.map((entry) => entry.ageDays);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let target = random() * total;
    let index = 0;
    while (index < pool.length - 1 && target > weights[index]) {
      target -= weights[index];
      index++;
    }
    const [chosen] = pool.splice(index, 1);
    picks.push({
      concept: chosen.concept,
      ageDays: chosen.ageDays,
      reason: `not written about for about ${Math.round(chosen.ageDays / 30)} months`,
    });
  }

  return picks;
}

/** Two notes with nothing obvious in common. No claim is made about them. */
export function pickDistantPair(
  concepts: ConceptRecord[],
  random: RandomSource
): [ConceptRecord, ConceptRecord] | null {
  const eligible = concepts.filter((concept) => !isSuppressedLifecycle(concept.lifecycle));
  if (eligible.length < 2) return null;

  const first = eligible[Math.floor(random() * eligible.length)];
  const others = eligible.filter(
    (concept) => concept.key !== first.key && topFolder(concept.path) !== topFolder(first.path)
  );
  const pool = others.length > 0 ? others : eligible.filter((concept) => concept.key !== first.key);
  const second = pool[Math.floor(random() * pool.length)];
  return [first, second];
}

function topFolder(path: string): string {
  return path.split("/")[0] || "";
}

export class SerendipityService {
  constructor(
    private readonly manifest: ImportManifestService,
    private readonly random: RandomSource = Math.random,
    private readonly clock: () => number = Date.now
  ) {}

  forgotten(vaultId: string, count = 3): ForgottenPick[] {
    const concepts = this.manifest.listConcepts().filter((concept) => concept.vaultId === vaultId);
    return pickForgotten(concepts, count, this.clock(), this.random);
  }

  /**
   * Write a juxtaposition into its own space. It is allowed to stay
   * unjustified, become artistic, or disappear - all three are fine.
   */
  async writeStrangeConnection(store: KnowledgeFileStore): Promise<string | null> {
    const concepts = this.manifest.listConcepts().filter((concept) => concept.vaultId === store.vaultId);
    const pair = pickDistantPair(concepts, this.random);
    if (!pair) return null;

    const [left, right] = pair;
    const title = `${left.title} and ${right.title}`;
    const path = joinPath(PERSONAL_FOLDERS.strangeConnections, `${sanitizeNoteName(title)}.md`);

    const existing =
      (await store.read(path)) ??
      [
        `# ${title}`,
        "",
        "_Put beside each other on purpose. There is no claim that one explains the other._",
        "",
        "## What this brings up",
        "",
        "",
      ].join("\n");

    const body = [
      `- ${toWikiLink(left.title)}`,
      `- ${toWikiLink(right.title)}`,
      "",
      "They may turn out to be connected, may stay only interesting, or may come to nothing.",
    ].join("\n");

    let content = upsertManagedBlock(existing, "pair", "## The two notes", body);
    content = upsertFrontmatterFields(content, {
      type: "strange-connection",
      layer: "garden",
      epistemic_status: "provisional",
      generated_by: "chatgpt-md",
    });
    await store.write(path, content);
    return path;
  }
}
