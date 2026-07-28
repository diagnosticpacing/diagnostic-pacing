import { get, head, put, BlobNotFoundError } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { CurrentPointer, KnowledgeRevision, RevisionIndex } from "./types";

export type StoredCurrent = { pointer: CurrentPointer; etag: string | null };

export interface KnowledgeRepository {
  getCurrent(): Promise<StoredCurrent | null>;
  getRevision(revision: number): Promise<KnowledgeRevision | null>;
  getIndex(): Promise<RevisionIndex | null>;
  writeRevision(revision: KnowledgeRevision): Promise<void>;
  writeIndex(index: RevisionIndex): Promise<void>;
  writeCurrent(pointer: CurrentPointer, expectedEtag: string | null): Promise<void>;
}

const PREFIX = "diagnostic-pacing/knowledge";
const CURRENT = `${PREFIX}/current.json`;
const INDEX = `${PREFIX}/index.json`;
const revisionPath = (revision: number) =>
  `${PREFIX}/revisions/${String(revision).padStart(6, "0")}.json`;
const encode = (value: unknown) => JSON.stringify(value, null, 2);

async function readBlob<T>(pathname: string): Promise<{ value: T; etag: string } | null> {
  try {
    const metadata = await head(pathname);
    const response = await get(metadata.url, {
      access: "private",
    });

    if (!response || response.statusCode !== 200) {
      throw new Error(`Could not read ${pathname}.`);
    }

    const value = await new Response(response.stream).json() as T;

    return {
      value,
      etag: metadata.etag,
    };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

class BlobRepository implements KnowledgeRepository {
  async getCurrent() {
    const found = await readBlob<CurrentPointer>(CURRENT);
    return found ? { pointer: found.value, etag: found.etag } : null;
  }
  async getRevision(revision: number) {
    return (await readBlob<KnowledgeRevision>(revisionPath(revision)))?.value ?? null;
  }
  async getIndex() {
    return (await readBlob<RevisionIndex>(INDEX))?.value ?? null;
  }
  async writeRevision(revision: KnowledgeRevision) {
    await put(revisionPath(revision.metadata.revision), encode(revision), {
      access: "private", addRandomSuffix: false, contentType: "application/json",
      cacheControlMaxAge: 60,
    });
  }
  async writeIndex(index: RevisionIndex) {
    await put(INDEX, encode(index), {
      access: "private", addRandomSuffix: false, allowOverwrite: true,
      contentType: "application/json", cacheControlMaxAge: 60,
    });
  }
  async writeCurrent(pointer: CurrentPointer, expectedEtag: string | null) {
    await put(CURRENT, encode(pointer), {
      access: "private", addRandomSuffix: false,
      allowOverwrite: expectedEtag !== null,
      ...(expectedEtag ? { ifMatch: expectedEtag } : {}),
      contentType: "application/json", cacheControlMaxAge: 60,
    });
  }
}

const ROOT = path.join(process.cwd(), ".data", "knowledge");
const currentFile = path.join(ROOT, "current.json");
const indexFile = path.join(ROOT, "index.json");
const revFile = (revision: number) => path.join(ROOT, "revisions", `${String(revision).padStart(6, "0")}.json`);

async function readFile<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

class LocalRepository implements KnowledgeRepository {
  async getCurrent() {
    const pointer = await readFile<CurrentPointer>(currentFile);
    return pointer ? { pointer, etag: String(pointer.currentRevision) } : null;
  }
  getRevision(revision: number) { return readFile<KnowledgeRevision>(revFile(revision)); }
  getIndex() { return readFile<RevisionIndex>(indexFile); }
  async writeRevision(revision: KnowledgeRevision) {
    const file = revFile(revision.metadata.revision);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, encode(revision), { encoding: "utf8", flag: "wx" });
  }
  async writeIndex(index: RevisionIndex) {
    await fs.mkdir(ROOT, { recursive: true });
    await fs.writeFile(indexFile, encode(index), "utf8");
  }
  async writeCurrent(pointer: CurrentPointer, expectedEtag: string | null) {
    const existing = await readFile<CurrentPointer>(currentFile);
    if (expectedEtag !== null && String(existing?.currentRevision ?? "") !== expectedEtag) {
      throw new Error("The current revision changed before the save completed.");
    }
    await fs.mkdir(ROOT, { recursive: true });
    await fs.writeFile(currentFile, encode(pointer), "utf8");
  }
}

let instance: KnowledgeRepository | null = null;

function shouldUseBlobRepository(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_STORE_ID ||
    process.env.VERCEL
  );
}

export function getKnowledgeRepository(): KnowledgeRepository {
  instance ??= shouldUseBlobRepository()
    ? new BlobRepository()
    : new LocalRepository();

  return instance;
}
