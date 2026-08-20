import { SemanticUnit, SemanticUnitKind } from "src/Models/Knowledge/SemanticUnit";

/**
 * The default shape of the personal vault.
 *
 * These are starting folders, not a cage: if the vault already has a folder
 * that means the same thing (for example "03 Patterns" instead of "Patterns"),
 * the router reuses the existing one. Semantics live in links and frontmatter,
 * so the tree stays deliberately shallow.
 */

export const PERSONAL_FOLDERS = {
  home: "00 HOME",
  identity: "01 Self/Identity",
  values: "01 Self/Values",
  needs: "01 Self/Needs",
  beliefs: "01 Self/Beliefs",
  contradictions: "01 Self/Contradictions",
  questions: "01 Self/Questions",
  emotions: "02 Inner Life/Emotions",
  fear: "02 Inner Life/Fear",
  desire: "02 Inner Life/Desire",
  shame: "02 Inner Life/Shame",
  uncertainty: "02 Inner Life/Uncertainty",
  trust: "02 Inner Life/Trust",
  presence: "02 Inner Life/Presence",
  patterns: "03 Patterns",
  dreams: "04 Dreams/Dreams",
  dreamSymbols: "04 Dreams/Symbols",
  dreamPeople: "04 Dreams/People",
  dreamPlaces: "04 Dreams/Places",
  dreamThemes: "04 Dreams/Themes",
  relationships: "05 Relationships",
  love: "05 Relationships/Love",
  friendship: "05 Relationships/Friendship",
  family: "05 Relationships/Family",
  intimacy: "05 Relationships/Intimacy",
  progress: "06 Progress",
  timeline: "06 Progress/Timeline",
  turningPoints: "06 Progress/Turning Points",
  lessons: "06 Progress/Lessons",
  pastExperiments: "06 Progress/Experiments",
  philosophy: "07 Philosophy",
  knowledge: "08 Knowledge",
  interests: "09 Interests",
  music: "10 Music",
  songIdeas: "10 Music/Song Ideas",
  artists: "10 Music/Artists",
  albums: "10 Music/Albums",
  library: "11 Library",
  books: "11 Library/Books",
  films: "11 Library/Films",
  essays: "11 Library/Essays",
  thingsToRemember: "11 Library/Things To Remember",
  people: "12 People",
  experiences: "13 Experiences/Memories",
  travel: "13 Experiences/Travel",
  places: "13 Experiences/Places",
  // Horizon: what has not happened yet. Kept as its own area so the archive
  // cannot quietly turn the past into destiny.
  horizon: "14 Horizon",
  neverTried: "14 Horizon/Things I Have Never Tried",
  possibleLives: "14 Horizon/Possible Lives",
  experiments: "14 Horizon/Lived Experiments",
  openQuestions: "14 Horizon/Questions Without Answers",
  // Things worth preserving that are not worth interpreting.
  fragments: "15 Fragments",
  notUnderstood: "15 Fragments/Things I Don't Understand",
  strangeConnections: "16 Strange Connections",
  sources: "90 ChatGPT Sources",
  system: "99 System",
  importLogs: "99 System/Import Logs",
  uncategorized: "99 System/Uncategorized",
} as const;

/** Inner-life concepts that have their own folder in the default ontology. */
const INNER_LIFE_TERMS: Array<[RegExp, string]> = [
  [/\b(fear|afraid|anxiet|dread|panic|judg)/i, PERSONAL_FOLDERS.fear],
  [/\b(desire|longing|want|craving|lust)/i, PERSONAL_FOLDERS.desire],
  [/\b(shame|guilt|embarrass|humiliat)/i, PERSONAL_FOLDERS.shame],
  [/\b(uncertain|doubt|ambigu|not knowing)/i, PERSONAL_FOLDERS.uncertainty],
  [/\b(trust|safety|reliab)/i, PERSONAL_FOLDERS.trust],
  [/\b(presence|present moment|mindful|attention)/i, PERSONAL_FOLDERS.presence],
];

const PATTERN_TERMS =
  /\b(pattern|avoid|control|urgency|flight|freeze|rumina|reassur|procrastinat|perfection|overthink|attach|withdraw|escape)/i;

const MEDIA_FOLDERS: Array<[RegExp, string]> = [
  [/\b(book|novel|memoir|read)/i, PERSONAL_FOLDERS.books],
  [/\b(film|movie|cinema|documentary|series)/i, PERSONAL_FOLDERS.films],
  [/\b(album|record|ep\b|lp\b)/i, PERSONAL_FOLDERS.albums],
  [/\b(artist|band|producer|musician|dj)/i, PERSONAL_FOLDERS.artists],
  [/\b(essay|article|paper|talk)/i, PERSONAL_FOLDERS.essays],
];

function mediaFolder(unit: SemanticUnit): string {
  const haystack = [unit.category || "", unit.title, unit.content, ...unit.concepts].join(" ");
  const entityType = unit.entities[0]?.type;
  if (entityType === "book") return PERSONAL_FOLDERS.books;
  if (entityType === "film") return PERSONAL_FOLDERS.films;
  if (entityType === "album") return PERSONAL_FOLDERS.albums;
  if (entityType === "artist") return PERSONAL_FOLDERS.artists;
  const match = MEDIA_FOLDERS.find(([pattern]) => pattern.test(haystack));
  return match ? match[1] : PERSONAL_FOLDERS.thingsToRemember;
}

function innerLifeFolder(unit: SemanticUnit): string {
  const haystack = [unit.title, unit.category || "", ...unit.concepts, ...(unit.emotions || [])].join(" ");
  const match = INNER_LIFE_TERMS.find(([pattern]) => pattern.test(haystack));
  return match ? match[1] : PERSONAL_FOLDERS.emotions;
}

const RELATIONSHIP_TERMS: Array<[RegExp, string]> = [
  [/\b(love|partner|romantic|girlfriend|boyfriend|marriage)/i, PERSONAL_FOLDERS.love],
  [/\b(friend|friendship)/i, PERSONAL_FOLDERS.friendship],
  [/\b(family|mother|father|parent|brother|sister|sibling)/i, PERSONAL_FOLDERS.family],
  [/\b(intimacy|sex|closeness|vulnerab)/i, PERSONAL_FOLDERS.intimacy],
];

/** Kinds with one fixed home in the default ontology. */
const FIXED_FOLDERS: Partial<Record<SemanticUnitKind, string>> = {
  dream: PERSONAL_FOLDERS.dreams,
  person: PERSONAL_FOLDERS.people,
  "music-idea": PERSONAL_FOLDERS.songIdeas,
  pattern: PERSONAL_FOLDERS.patterns,
  belief: PERSONAL_FOLDERS.beliefs,
  value: PERSONAL_FOLDERS.values,
  question: PERSONAL_FOLDERS.questions,
  contradiction: PERSONAL_FOLDERS.contradictions,
  lesson: PERSONAL_FOLDERS.lessons,
  experience: PERSONAL_FOLDERS.experiences,
  philosophy: PERSONAL_FOLDERS.philosophy,
  knowledge: PERSONAL_FOLDERS.knowledge,
  horizon: PERSONAL_FOLDERS.horizon,
  experiment: PERSONAL_FOLDERS.experiments,
  fragment: PERSONAL_FOLDERS.fragments,
  "strange-connection": PERSONAL_FOLDERS.strangeConnections,
};

/** Kinds whose destination depends on what the unit is actually about. */
const DYNAMIC_FOLDERS: Partial<Record<SemanticUnitKind, (unit: SemanticUnit, haystack: string) => string>> = {
  relationship: (_unit, haystack) => {
    const match = RELATIONSHIP_TERMS.find(([pattern]) => pattern.test(haystack));
    return match ? match[1] : PERSONAL_FOLDERS.relationships;
  },
  media: (unit) => mediaFolder(unit),
  emotion: (unit) => innerLifeFolder(unit),
  insight: (_unit, haystack) => (PATTERN_TERMS.test(haystack) ? PERSONAL_FOLDERS.patterns : PERSONAL_FOLDERS.lessons),
};

/** Default destination inside the personal vault for one unit. */
export function personalFolderFor(unit: SemanticUnit): string {
  const haystack = [unit.title, unit.category || "", ...unit.concepts].join(" ");
  const dynamic = DYNAMIC_FOLDERS[unit.kind];
  if (dynamic) return dynamic(unit, haystack);
  return FIXED_FOLDERS[unit.kind] || PERSONAL_FOLDERS.uncategorized;
}

/**
 * Reuse a folder the vault already has when it means the same thing.
 * "Patterns" matches an existing "03 Patterns"; "Dreams" matches "04 Dreams/Dreams".
 */
export function matchExistingFolder(existingFolders: string[], desired: string): string | undefined {
  const desiredSegments = desired.split("/").map(normalizeFolderSegment);
  const scored = existingFolders
    .map((folder) => ({ folder, segments: folder.split("/").map(normalizeFolderSegment) }))
    .filter((candidate) => candidate.segments.length > 0);

  const exact = scored.find(
    (candidate) =>
      candidate.segments.length === desiredSegments.length &&
      candidate.segments.every((segment, index) => segment === desiredSegments[index])
  );
  if (exact) return exact.folder;

  const leaf = desiredSegments[desiredSegments.length - 1];
  const leafMatch = scored.find((candidate) => candidate.segments[candidate.segments.length - 1] === leaf);
  return leafMatch?.folder;
}

export function normalizeFolderSegment(segment: string): string {
  return segment
    .replace(/^\s*\d+[\s._-]*/, "")
    .trim()
    .toLowerCase();
}
