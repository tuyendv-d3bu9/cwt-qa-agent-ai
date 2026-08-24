// agents/runtime/cache.js

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as P from "./paths.js";

const CACHE_DIR = path.resolve(process.cwd(), P.CACHE_DIR);

export function cacheEnabled() {
  return !process.argv.includes("--no-cache");
}

export function cacheKey(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
}

export async function getCache(payload) {
  if (!cacheEnabled()) return null;
  const file = path.join(CACHE_DIR, cacheKey(payload) + ".json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function setCache(payload, value) {
  if (!cacheEnabled()) return;
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheKey(payload) + ".json");
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}
