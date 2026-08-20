import { PERSONAL_FOLDERS } from "src/Services/Knowledge/PersonalOntology";

/**
 * Settings for the ChatGPT history knowledge importer.
 *
 * Everything is off by default: a user who never enables the importer gets the
 * plugin they had before, with no extra commands, no startup work and no
 * background watching.
 */
export interface KnowledgeImporterSettings {
  /** Master switch. Commands are only registered when this is on. */
  knowledgeEnabled: boolean;
  /** JSON array of vault definitions, merged over discovered vaults. */
  knowledgeVaultRegistry: string;
  /** Vault id or name that holds the immutable source archive. Empty = current vault. */
  knowledgeArchiveVault: string;
  /** Vault id or name that represents the person. Empty = auto-detect. */
  knowledgePersonalVault: string;
  /** Folder inside the archive vault for source conversations. */
  knowledgeArchiveFolder: string;
  /** Folder watched for new ChatGPT exports/conversations. */
  knowledgeInboxFolder: string;
  /** Poll the inbox folder while Obsidian is open. */
  knowledgeWatchInbox: boolean;
  knowledgeWatchIntervalSeconds: number;
  /** Model used for bulk extraction. Empty = the configured chat model. */
  knowledgeExtractionModel: string;
  /** Conversations processed in parallel. */
  knowledgeBatchSize: number;
  /** At or above this confidence a unit is filed automatically. */
  knowledgeAutoRouteConfidence: number;
  /** Below this confidence nothing is filed; the unit goes to review. */
  knowledgeReviewConfidence: number;
  /** Long conversations are chunked at this size; nothing is ever truncated. */
  knowledgeMaxCharsPerChunk: number;
  /** Conversations with less user text than this are archived but not analyzed. */
  knowledgeMinConversationChars: number;
  knowledgeEnableDreams: boolean;
  knowledgeEnablePeople: boolean;
  knowledgeEnableMedia: boolean;
}

export const DEFAULT_KNOWLEDGE_SETTINGS: KnowledgeImporterSettings = {
  knowledgeEnabled: false,
  knowledgeVaultRegistry: "",
  knowledgeArchiveVault: "",
  knowledgePersonalVault: "",
  knowledgeArchiveFolder: PERSONAL_FOLDERS.sources,
  knowledgeInboxFolder: "ChatGPT Inbox",
  knowledgeWatchInbox: false,
  knowledgeWatchIntervalSeconds: 300,
  knowledgeExtractionModel: "",
  knowledgeBatchSize: 3,
  knowledgeAutoRouteConfidence: 0.75,
  knowledgeReviewConfidence: 0.45,
  knowledgeMaxCharsPerChunk: 12000,
  knowledgeMinConversationChars: 200,
  knowledgeEnableDreams: true,
  knowledgeEnablePeople: true,
  knowledgeEnableMedia: true,
};

/** Example registry shown in settings and docs. Vaults may live anywhere. */
export const VAULT_REGISTRY_EXAMPLE = `[
  {
    "name": "Personal",
    "kind": "personal",
    "path": "/absolute/path/to/Personal",
    "description": "My own knowledge graph: self, patterns, dreams, relationships, taste, philosophy."
  },
  {
    "name": "Product",
    "kind": "project",
    "path": "/absolute/path/to/Product",
    "description": "The product itself: identity system, profiles, integrations, backend, frontend."
  }
]`;
