// Read-only inspection tool for the production Vercel Blob knowledge store.
//
// Usage (from the project root, in a real terminal with internet access):
//   node scripts/blob-status.mjs
//
// Requires BLOB_READ_WRITE_TOKEN to be set in .env.local (this script loads
// it automatically). Writes a full snapshot to .data/blob-snapshot.json
// (already gitignored) for offline inspection — nothing is uploaded anywhere.

import { get, head, BlobNotFoundError } from "@vercel/blob";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  let content;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    console.error(`Could not read ${envPath}. Run this from the project root.`);
    process.exit(1);
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "BLOB_READ_WRITE_TOKEN is not set in .env.local. Add it and try again.",
  );
  process.exit(1);
}

const PREFIX = "diagnostic-pacing/knowledge";

async function readJson(pathname) {
  try {
    const metadata = await head(pathname);
    const response = await get(metadata.url, { access: "private" });
    if (!response || response.statusCode !== 200) {
      throw new Error(`Could not read ${pathname}.`);
    }
    return await new Response(response.stream).json();
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    throw error;
  }
}

const current = await readJson(`${PREFIX}/current.json`);

if (!current) {
  console.log(
    "No current.json found in Blob storage. The production knowledge base has never been saved (or the token/prefix is wrong).",
  );
  process.exit(0);
}

const index = await readJson(`${PREFIX}/index.json`);
const revisionFile = `${PREFIX}/revisions/${String(
  current.currentRevision,
).padStart(6, "0")}.json`;
const revision = await readJson(revisionFile);

console.log("=== Production Blob knowledge base status ===");
console.log("Current revision:", current.currentRevision);
console.log("Updated at:", current.updatedAt);
console.log("Total revisions in index:", index?.revisions?.length ?? 0);

if (revision) {
  console.log("\nRow counts per sheet:");
  for (const [sheetId, rows] of Object.entries(revision.workbook.sheets)) {
    console.log(`  ${sheetId}: ${Array.isArray(rows) ? rows.length : "?"} rows`);
  }
} else {
  console.log(
    `\nWarning: current.json points to revision ${current.currentRevision}, but that revision file was not found.`,
  );
}

mkdirSync(".data", { recursive: true });
writeFileSync(
  ".data/blob-snapshot.json",
  JSON.stringify({ current, index, revision }, null, 2),
);
console.log(
  "\nFull snapshot written to .data/blob-snapshot.json (gitignored, local only).",
);
