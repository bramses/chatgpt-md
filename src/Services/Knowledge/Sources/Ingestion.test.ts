import { FileStat } from "../KnowledgeFileStore";
import { SourceFileReader, looksAbsolute } from "../SourceFileReader";
import { extractZipEntry, findConversationsEntry, listZipEntries } from "../ZipReader";
import { NodeRuntime } from "../NodeRuntime";
import { OfficialExportAdapter } from "./OfficialExportAdapter";
import { WatchFolderAdapter } from "./WatchFolderAdapter";
import { LiveCaptureAdapter, normalizeLivePayload } from "./LiveCaptureAdapter";
import { IngestionSourceRecord } from "src/Models/Knowledge/KnowledgeImportManifest";
import { deflateRawSync, inflateRawSync } from "zlib";

// Obsidian exposes Node through `globalThis.require`, which Jest does not have,
// so the runtime probe is replaced with the real zlib functions here.
beforeAll(() => {
  NodeRuntime.override({
    zlib: { inflateRawSync },
    supportsArchives: () => true,
    isAvailable: () => true,
  } as unknown as NodeRuntime);
});

afterAll(() => NodeRuntime.override(undefined));

const CONVERSATION = {
  conversation_id: "conv-1",
  title: "A talk",
  create_time: 1735689600,
  current_node: "n1",
  mapping: {
    n1: {
      id: "n1",
      parent: null,
      children: [],
      message: { id: "m1", author: { role: "user" }, content: { parts: ["hello there"] } },
    },
  },
};

/** In-memory reader standing in for the vault adapter and the filesystem. */
class FakeReader implements SourceFileReader {
  constructor(
    private readonly text: Record<string, string> = {},
    private readonly binary: Record<string, Uint8Array> = {},
    private readonly stats: Record<string, FileStat> = {}
  ) {}

  isAbsoluteSupported(): boolean {
    return true;
  }
  async exists(ref: string): Promise<boolean> {
    return ref in this.text || ref in this.binary;
  }
  async readText(ref: string): Promise<string> {
    if (!(ref in this.text)) throw new Error(`missing ${ref}`);
    return this.text[ref];
  }
  async readBinary(ref: string): Promise<Uint8Array> {
    if (!(ref in this.binary)) throw new Error(`missing ${ref}`);
    return this.binary[ref];
  }
  async stat(ref: string): Promise<FileStat | null> {
    return this.stats[ref] ?? null;
  }
  async listFiles(folder: string): Promise<string[]> {
    return [...Object.keys(this.text), ...Object.keys(this.binary)].filter((path) => path.startsWith(folder));
  }
}

/** Build a real ZIP (deflate + store) with Node zlib so the reader is tested for real. */
function buildZip(files: Array<{ name: string; content: string; store?: boolean }>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = Buffer.from(encoder.encode(file.name));
    const raw = Buffer.from(encoder.encode(file.content));
    const payload = file.store ? raw : deflateRawSync(raw);
    const method = file.store ? 0 : 8;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(Buffer.concat([local, nameBytes, payload]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBytes]));

    offset += 30 + nameBytes.length + payload.length;
  });

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([Buffer.concat(locals), centralBuffer, eocd]));
}

describe("ZipReader", () => {
  it("finds and inflates conversations.json inside an export archive", () => {
    const zip = buildZip([
      { name: "chat.html", content: "<html></html>" },
      { name: "conversations.json", content: JSON.stringify([CONVERSATION]) },
    ]);

    const entries = listZipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["chat.html", "conversations.json"]);

    const entry = findConversationsEntry(entries)!;
    expect(entry.name).toBe("conversations.json");
    expect(JSON.parse(extractZipEntry(zip, entry))[0].conversation_id).toBe("conv-1");
  });

  it("reads stored (uncompressed) entries too", () => {
    const zip = buildZip([{ name: "conversations.json", content: '{"conversations":[]}', store: true }]);
    const entry = findConversationsEntry(listZipEntries(zip))!;
    expect(extractZipEntry(zip, entry)).toBe('{"conversations":[]}');
  });

  it("rejects data that is not a ZIP", () => {
    expect(() => listZipEntries(new Uint8Array([1, 2, 3]))).toThrow(/Not a ZIP archive/);
  });
});

describe("OfficialExportAdapter", () => {
  it("reads conversations.json directly", async () => {
    const reader = new FakeReader({ "export/conversations.json": JSON.stringify([CONVERSATION]) });
    const [batch] = await new OfficialExportAdapter(["export/conversations.json"], reader).load();

    expect(batch.conversations).toHaveLength(1);
    expect(batch.conversations[0].sourceKind).toBe("official-export");
  });

  it("reads the export ZIP", async () => {
    const zip = buildZip([{ name: "conversations.json", content: JSON.stringify([CONVERSATION]) }]);
    const reader = new FakeReader({}, { "downloads/export.zip": zip });
    const [batch] = await new OfficialExportAdapter(["downloads/export.zip"], reader).load();

    expect(batch.conversations[0].conversationId).toBe("conv-1");
  });

  it("reports an unreadable file instead of throwing", async () => {
    const [batch] = await new OfficialExportAdapter(["missing.json"], new FakeReader()).load();
    expect(batch.conversations).toHaveLength(0);
    expect(batch.warnings[0].reason).toMatch(/Could not read missing.json/);
  });
});

describe("WatchFolderAdapter", () => {
  it("picks up new files in the inbox", async () => {
    const reader = new FakeReader(
      { "ChatGPT Inbox/new.json": JSON.stringify([CONVERSATION]) },
      {},
      { "ChatGPT Inbox/new.json": { size: 10, mtime: 100 } }
    );
    const [batch] = await new WatchFolderAdapter("ChatGPT Inbox", reader).load();

    expect(batch.conversations).toHaveLength(1);
    expect(batch.size).toBe(10);
    expect(batch.mtime).toBe(100);
  });

  it("skips files that have not changed since the last run", async () => {
    const seen: Record<string, IngestionSourceRecord> = {
      "ChatGPT Inbox/new.json": { ref: "ChatGPT Inbox/new.json", size: 10, mtime: 100, lastProcessedAt: "2026-01-01" },
    };
    const reader = new FakeReader(
      { "ChatGPT Inbox/new.json": JSON.stringify([CONVERSATION]) },
      {},
      { "ChatGPT Inbox/new.json": { size: 10, mtime: 100 } }
    );

    expect(await new WatchFolderAdapter("ChatGPT Inbox", reader, seen).load()).toHaveLength(0);

    seen["ChatGPT Inbox/new.json"].mtime = 50;
    expect(await new WatchFolderAdapter("ChatGPT Inbox", reader, seen).load()).toHaveLength(1);
  });

  it("ignores unsupported file types", async () => {
    const reader = new FakeReader({ "ChatGPT Inbox/notes.md": "# not an export" });
    expect(await new WatchFolderAdapter("ChatGPT Inbox", reader).load()).toHaveLength(0);
  });
});

describe("LiveCaptureAdapter", () => {
  it("normalizes a generic push payload into the standard pipeline shape", async () => {
    const [batch] = await new LiveCaptureAdapter([
      {
        conversationId: "live-1",
        title: "Live chat",
        createdAt: "2026-08-20T10:00:00.000Z",
        messages: [
          { id: "a", role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ],
      },
    ]).load();

    expect(batch.conversations).toHaveLength(1);
    expect(batch.conversations[0]).toMatchObject({
      conversationId: "live-1",
      title: "Live chat",
      sourceKind: "live-capture",
    });
    expect(batch.conversations[0].messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });

  it("reports payloads with nothing usable rather than inventing content", async () => {
    const [batch] = await new LiveCaptureAdapter([{ title: "Empty", messages: [] }]).load();
    expect(batch.conversations).toHaveLength(0);
    expect(batch.warnings).toHaveLength(1);
  });

  it("derives a stable id when the payload has none", () => {
    const payload = { title: "No id", messages: [{ role: "user", content: "hello" }] };
    const first = normalizeLivePayload(payload, "live-capture", "ref")!;
    const second = normalizeLivePayload(payload, "live-capture", "ref")!;
    expect(first.conversationId).toBe(second.conversationId);
  });
});

describe("looksAbsolute", () => {
  it("recognizes Windows and POSIX absolute paths", () => {
    expect(looksAbsolute("C:\\Users\\me\\export.zip")).toBe(true);
    expect(looksAbsolute("/home/me/export.zip")).toBe(true);
    expect(looksAbsolute("ChatGPT Inbox/export.zip")).toBe(false);
  });
});
