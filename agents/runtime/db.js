// agents/runtime/db.js
// The ONLY module allowed to open a SQLite database. Agents call the named helpers
// below; no agent writes raw SQL, for the same reason no agent touches node:fs
// directly (see tools.js).
//
// WHAT BELONGS HERE — see memory/README.md for the full tiering. Short version:
// this DB holds only knowledge that is STABLE and QUERIED (tier 2) plus relationship
// metadata. It does NOT hold the volatile knowledge in memory/project/*.md (domain
// facts, known issues, decisions): that changes often, the user edits it by hand, and
// git already gives it diffs and history. An earlier version of this file did store
// those as rows, which was the wrong tier — regenerating markdown from them destroyed
// hand edits just as surely as letting the LLM rewrite the files did.
//
// So the split is:
//   markdown (tier 3) — the knowledge content itself; hand-editable; git owns history
//   this DB (tier 2)  — terms/components/fields/config (queried, not injected), and
//                       the artifacts/derives_from graph, which answers the one
//                       question markdown cannot: "document X changed — which
//                       sections, test cases and specs are now stale?"
//
// TWO DATABASE FILES, one module — both are regenerable and neither is committed.
// Locations come from agents/runtime/paths.js (tri thức vs sản phẩm):
//   memory/project/knowledge.db — tier 2, KNOWLEDGE (rebuilt by re-running doc analysis)
//   .qa-run/runs.db             — tier 5, one run's session state
//
// node:sqlite is built into Node >=22.5 (verified working on Node v22.18 without any
// flag), so this adds no npm dependency and no native build step. It prints
// "ExperimentalWarning: SQLite is an experimental feature" on first use — expected,
// not suppressed on purpose: silencing it would hide a real API-stability caveat.
//
// CONCURRENCY: node:sqlite is a synchronous API. The pipeline runs strictly
// sequentially (one workflow process at a time), so no locking layer is provided.
// Running two flows against the same DB concurrently is not supported.

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as P from "./paths.js";

const ROOT = process.cwd();

// Re-exported (not re-declared) so paths.js stays the single source of truth for
// locations while existing importers of db.js keep working unchanged.
export const KNOWLEDGE_DB = P.KNOWLEDGE_DB;
export const RUNS_DB = P.RUNS_DB;

// Which file the tier-2 helpers below read/write. Overridable ONLY so tests do not
// mix their rows into the real knowledge DB — see useKnowledgeDb().
let knowledgeDbPath = KNOWLEDGE_DB;

// Same containment rule as tools.js's safe(): a prefix check alone would let a
// sibling directory through (".../repo-evil" starts with ".../repo").
function safeDbPath(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error(`DB path out of project scope: ${relPath}`);
  }
  return abs;
}

const SCHEMAS = {
  knowledge: [
    // ── Tier 2: stable reference knowledge, QUERIED not injected ──────────
    // See memory/README.md. These four tables are deliberately project-agnostic:
    // any project has terms, components, fields and configuration. Volatile
    // knowledge (domain facts, known issues, decisions) does NOT live here — it is
    // hand-editable markdown in tier 3, and git owns its history.

    `CREATE TABLE IF NOT EXISTS terms (
       id         TEXT PRIMARY KEY,
       term       TEXT NOT NULL,
       definition TEXT NOT NULL,
       aliases    TEXT,                       -- newline-separated alternative names
       source_ref TEXT,                       -- source document this came from
       updated_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_terms_term ON terms (term)`,

    `CREATE TABLE IF NOT EXISTS components (
       id          TEXT PRIMARY KEY,
       name        TEXT NOT NULL,
       kind        TEXT NOT NULL,             -- page | api | module | screen | service
       ref         TEXT,                      -- endpoint path, route, file...
       description TEXT,
       source_ref  TEXT,
       updated_at  TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_components_name ON components (name)`,

    `CREATE TABLE IF NOT EXISTS fields (
       id          TEXT PRIMARY KEY,
       name        TEXT NOT NULL,
       component   TEXT,                      -- components.name it belongs to (may be NULL)
       data_type   TEXT,
       constraints TEXT,                      -- min/max, required, case-sensitivity...
       notes       TEXT,
       source_ref  TEXT,
       updated_at  TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_fields_name ON fields (name)`,

    // The de-hardcoding mechanism: environment URL, project name, source doc dir.
    // Agent code MUST read these from here instead of embedding literals, otherwise
    // the same codebase cannot serve a second project (memory/README.md).
    `CREATE TABLE IF NOT EXISTS config (
       key         TEXT PRIMARY KEY,
       value       TEXT NOT NULL,
       description TEXT,
       source_ref  TEXT,
       updated_at  TEXT NOT NULL
     )`,

    // ── Traceability graph (tier 2 metadata, no knowledge content) ─────────
    // Every traceable thing in the pipeline. `ref` is the natural key a human would
    // use (a file path, or a TC_ID) — `id` is "<kind>:<ref>".
    `CREATE TABLE IF NOT EXISTS artifacts (
       id         TEXT PRIMARY KEY,
       kind       TEXT NOT NULL,              -- doc | section | testcase | spec | screenshot
       ref        TEXT NOT NULL,
       hash       TEXT,
       status     TEXT NOT NULL DEFAULT 'fresh',   -- fresh | stale
       updated_at TEXT NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts (kind, status)`,

    // The edge that makes targeted updates possible: doc -> section -> testcase -> spec.
    // Without it, a changed document can only trigger "re-do everything".
    `CREATE TABLE IF NOT EXISTS derives_from (
       from_id TEXT NOT NULL,                 -- the derived artifact
       to_id   TEXT NOT NULL,                 -- what it was derived FROM
       PRIMARY KEY (from_id, to_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_derives_to ON derives_from (to_id)`,
  ],

  runs: [
    // ── Tier 5: run/session state ──────────────────────────────────────────
    // Owned by agents/runtime/memory.js — that module holds the SQL for these
    // tables, the same way knowledge.js holds the SQL for tier 2. db.js only
    // declares the schema and opens the file.
    `CREATE TABLE IF NOT EXISTS runs (
       run_id     TEXT PRIMARY KEY,
       feature    TEXT,
       created_at TEXT NOT NULL,
       status     TEXT NOT NULL DEFAULT 'active'   -- active | done | blocked
     )`,
    `CREATE TABLE IF NOT EXISTS run_steps (
       run_id         TEXT NOT NULL,
       agent          TEXT NOT NULL,
       status         TEXT NOT NULL,
       output         TEXT,
       round          INTEGER,
       note           TEXT,
       human_approved INTEGER NOT NULL DEFAULT 0,
       approved_by    TEXT,
       updated_at     TEXT NOT NULL,
       PRIMARY KEY (run_id, agent)
     )`,

    // "Phiên hiện tại" — the one thing the old JSON backend could not express.
    // A single row (CHECK id = 1) pointing at the run that flow-2/flow-3 are
    // currently working on. Without this pointer, "which run am I in?" would have
    // to be guessed from timestamps, and resuming a paused run would be ambiguous
    // as soon as two runs exist.
    `CREATE TABLE IF NOT EXISTS session (
       id     INTEGER PRIMARY KEY CHECK (id = 1),
       run_id TEXT
     )`,
  ],
};

// Which schema each database file carries.
const SCHEMA_OF = new Map([
  [KNOWLEDGE_DB, "knowledge"],
  [RUNS_DB, "runs"],
]);

const _open = new Map();

/**
 * Point the tier-2 helpers at a different file. TEST-ONLY: production code
 * must never call this — the whole point of a single knowledge DB is that every
 * agent reads the same one. Pass no argument to restore the real path.
 */
export function useKnowledgeDb(relPath = KNOWLEDGE_DB) {
  if (relPath !== KNOWLEDGE_DB) SCHEMA_OF.set(relPath, "knowledge");
  knowledgeDbPath = relPath;
  return relPath;
}

/** Open (once per process) and migrate a database. Migrations are idempotent. */
export function db(relPath = knowledgeDbPath) {
  if (_open.has(relPath)) return _open.get(relPath);

  const schema = SCHEMAS[SCHEMA_OF.get(relPath)];
  if (!schema) throw new Error(`Unknown database "${relPath}" — register it in db.js first.`);

  const abs = safeDbPath(relPath);
  mkdirSync(path.dirname(abs), { recursive: true });

  const handle = new DatabaseSync(abs);
  handle.exec("PRAGMA foreign_keys = ON");
  for (const stmt of schema) handle.exec(stmt);

  _open.set(relPath, handle);
  return handle;
}

/**
 * Create + migrate the databases up front, at the start of a run.
 *
 * db() alone would create each file lazily, whenever some code path first happens to
 * touch it — so the file could appear halfway through a run, or not at all if that
 * path never executed. Calling this from the workflow entry point makes the schema
 * exist before any agent runs, and makes "the DB was created" a visible, logged event
 * instead of a side effect.
 *
 * Idempotent: safe to call on every run (CREATE TABLE IF NOT EXISTS).
 */
export function initDatabases({ knowledge = true, runs = true } = {}) {
  const result = [];
  const targets = [];
  if (knowledge) targets.push(knowledgeDbPath);
  if (runs) targets.push(RUNS_DB);

  for (const relPath of targets) {
    const existedBefore = existsSync(safeDbPath(relPath));
    db(relPath);
    result.push({ path: relPath, created: !existedBefore });
  }
  return result;
}

/** Close all open handles. Only needed by tests; the process exit closes them anyway. */
export function closeAll() {
  for (const [key, handle] of _open) {
    handle.close();
    _open.delete(key);
  }
}

const now = () => new Date().toISOString();

// ── artifacts + traceability graph ───────────────────────────────────

export function artifactId(kind, ref) {
  return `${kind}:${ref}`;
}

export function upsertArtifact({ kind, ref, hash = null, status = "fresh" }) {
  const id = artifactId(kind, ref);
  db(knowledgeDbPath)
    .prepare(`INSERT INTO artifacts (id, kind, ref, hash, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, status = excluded.status, updated_at = excluded.updated_at`)
    .run(id, kind, ref, hash, status, now());
  return id;
}

export function getArtifact(kind, ref) {
  return db(knowledgeDbPath).prepare(`SELECT * FROM artifacts WHERE id = ?`).get(artifactId(kind, ref)) ?? null;
}

/** Record "derived was produced from source". Both must already exist as artifacts. */
export function linkArtifacts(derivedId, sourceId) {
  db(knowledgeDbPath)
    .prepare(`INSERT OR IGNORE INTO derives_from (from_id, to_id) VALUES (?, ?)`)
    .run(derivedId, sourceId);
}

/**
 * Everything downstream of the given artifacts, transitively — the query that
 * replaces "something changed, re-run the whole pipeline" with a precise list.
 * Walks breadth-first over derives_from and stops on cycles.
 */
export function downstreamOf(sourceIds) {
  const handle = db(knowledgeDbPath);
  const stmt = handle.prepare(`SELECT from_id FROM derives_from WHERE to_id = ?`);
  const seen = new Set();
  const queue = [...sourceIds];

  while (queue.length) {
    const current = queue.shift();
    for (const row of stmt.all(current)) {
      if (seen.has(row.from_id)) continue;
      seen.add(row.from_id);
      queue.push(row.from_id);
    }
  }
  if (seen.size === 0) return [];

  const placeholders = [...seen].map(() => "?").join(",");
  return handle.prepare(`SELECT * FROM artifacts WHERE id IN (${placeholders}) ORDER BY kind, ref`).all(...seen);
}

export function markArtifactsStale(ids) {
  if (ids.length === 0) return { updated: 0 };
  const handle = db(knowledgeDbPath);
  const stmt = handle.prepare(`UPDATE artifacts SET status = 'stale', updated_at = ? WHERE id = ?`);
  const stamp = now();
  let updated = 0;
  for (const id of ids) updated += stmt.run(stamp, id).changes;
  return { updated };
}

export function staleArtifacts(kind = null) {
  const handle = db(knowledgeDbPath);
  return kind
    ? handle.prepare(`SELECT * FROM artifacts WHERE status = 'stale' AND kind = ? ORDER BY ref`).all(kind)
    : handle.prepare(`SELECT * FROM artifacts WHERE status = 'stale' ORDER BY kind, ref`).all();
}
