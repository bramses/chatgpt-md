import { NodeRuntime } from "./NodeRuntime";

/**
 * Minimal ZIP reader for ChatGPT export archives.
 *
 * A full ZIP library would be a heavy dependency for one job: pulling
 * `conversations.json` out of the export. This reads the central directory and
 * inflates the one entry we need with Node's built-in zlib. Store (0) and
 * deflate (8) cover every archive ChatGPT produces; anything else raises a
 * clear error telling the user to extract the JSON manually.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readUint32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function readUint16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function decodeUtf8(data: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(data);
  let result = "";
  for (let index = 0; index < data.length; index++) result += String.fromCharCode(data[index]);
  return result;
}

function findEndOfCentralDirectory(data: Uint8Array): number {
  const minimum = Math.max(0, data.length - 0xffff - 22);
  for (let offset = data.length - 22; offset >= minimum; offset--) {
    if (readUint32(data, offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

export function listZipEntries(data: Uint8Array): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(data);
  if (eocd === -1) throw new Error("Not a ZIP archive (no end-of-central-directory record found)");

  const entryCount = readUint16(data, eocd + 10);
  let offset = readUint32(data, eocd + 16);
  if (offset === ZIP64_MARKER) {
    throw new Error("ZIP64 archives are not supported. Please extract conversations.json and select it directly.");
  }

  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount && offset + 46 <= data.length; index++) {
    if (readUint32(data, offset) !== CENTRAL_SIGNATURE) break;
    const nameLength = readUint16(data, offset + 28);
    const extraLength = readUint16(data, offset + 30);
    const commentLength = readUint16(data, offset + 32);
    entries.push({
      name: decodeUtf8(data.subarray(offset + 46, offset + 46 + nameLength)),
      compressionMethod: readUint16(data, offset + 10),
      compressedSize: readUint32(data, offset + 20),
      uncompressedSize: readUint32(data, offset + 24),
      localHeaderOffset: readUint32(data, offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function extractZipEntry(data: Uint8Array, entry: ZipEntry, runtime: NodeRuntime = NodeRuntime.get()): string {
  if (entry.compressedSize === ZIP64_MARKER || entry.uncompressedSize === ZIP64_MARKER) {
    throw new Error("ZIP64 entries are not supported. Please extract conversations.json and select it directly.");
  }
  const header = entry.localHeaderOffset;
  if (readUint32(data, header) !== LOCAL_SIGNATURE) throw new Error(`Corrupt ZIP entry: ${entry.name}`);

  const nameLength = readUint16(data, header + 26);
  const extraLength = readUint16(data, header + 28);
  const start = header + 30 + nameLength + extraLength;
  const payload = data.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) return decodeUtf8(payload);
  if (entry.compressionMethod !== 8) {
    throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}`);
  }
  if (!runtime.supportsArchives()) {
    throw new Error("ZIP support requires Obsidian desktop. Please select conversations.json instead.");
  }
  return decodeUtf8(runtime.zlib!.inflateRawSync(payload));
}

/** Find the conversations file inside an export archive, ignoring folder depth. */
export function findConversationsEntry(entries: ZipEntry[]): ZipEntry | undefined {
  const named = entries.filter((entry) => /(^|\/)conversations\.json$/i.test(entry.name));
  if (named.length > 0) return named.sort((a, b) => a.name.length - b.name.length)[0];
  return entries.find((entry) => entry.name.toLowerCase().endsWith(".json") && !entry.name.includes("__MACOSX"));
}
