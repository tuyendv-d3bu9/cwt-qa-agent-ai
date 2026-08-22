// agents/runtime/memory.js
// Tier 5 — run/session state and the human-approval gate. See memory/README.md.
//
// Backend: memory/working/runs.db (table `runs`, `run_steps`, `session`).
// It used to be a single JSON file, memory/working/workflow.json, which could hold
// exactly ONE run: every new feature appended to the same steps[] array, `run_id`
// stayed null forever, and finishing a run erased the previous one. There was no way
// to answer "which run is this?" or "what happened last time?" — the two questions
// point 8 of the brief is actually about.
//
// The public API is unchanged (loadState / saveState / startRun / markStep /
// approveStep / requireApproved / printState) so the flows and agents/approve.js keep
// working; currentRun / finishRun / listRuns are new, and only the flows use them.
// The functions stay `async` even though node:sqlite is synchronous — callers already
// await them, and keeping the signatures means no call site had to change.
//
// SQL for these three tables lives here, not in db.js, matching how knowledge.js owns
// the SQL for tier 2. db.js only declares the schema and opens the file.

import { existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { db, RUNS_DB } from "./db.js";

// Historical location, kept only so importLegacyJson() can still find and adopt a state
// file written before the DB backend existed. Nothing writes here any more.
const LEGACY_STATE_FILE = path.resolve(process.cwd(), "memory/working/workflow.json");

/** Fields a step actually has. Anything else is a typo, and the old JSON backend
 *  accepted it silently — `markStep(a, { statuss: "done" })` wrote a dead key and the
 *  step stayed `pending` with no error anywhere. */
const STEP_FIELDS = ["status", "output", "round", "note", "human_approved", "approved_by"];

const now = () => new Date().toISOString();

let migrationChecked = false;

/**
 * Open runs.db lazily. Lazily matters: agents/qa-verifier/index.js imports markStep at
 * module load, so opening the DB at import time would create the file merely by
 * importing an agent — the opposite of initDatabases()' "creation is a visible event".
 */
function handle() {
  const h = db(RUNS_DB);
  if (!migrationChecked) {
    migrationChecked = true;
    importLegacyJson(h);
  }
  return h;
}

/**
 * One-time import of the old memory/working/workflow.json. Only runs when the DB has
 * no runs at all, so it can never overwrite live DB state. Without this, upgrading
 * mid-run would silently drop a pause that is waiting for the user's answers, and
 * flow-2 would re-run the whole LLM setup as if nothing had happened.
 *
 * The file is renamed afterwards (not deleted — it is the user's state) so a stale
 * copy cannot be re-imported later or mistaken for the live source of truth.
 */
function importLegacyJson(h) {
  if (!existsSync(LEGACY_STATE_FILE)) return;
  if (h.prepare(`SELECT COUNT(*) AS n FROM runs`).get().n > 0) return;

  let legacy;
  try {
    legacy = JSON.parse(readFileSync(LEGACY_STATE_FILE, "utf8"));
  } catch (err) {
    console.warn(`[memory] Bỏ qua ${LEGACY_STATE_FILE} — không parse được: ${err.message}`);
    return;
  }

  const runId = legacy.run_id ?? `imported-${(legacy.created_at ?? now()).slice(0, 10)}`;
  h.prepare(`INSERT INTO runs (run_id, feature, created_at, status) VALUES (?, ?, ?, 'active')`)
    .run(runId, legacy.feature ?? null, legacy.created_at ?? now());
  h.prepare(`INSERT INTO session (id, run_id) VALUES (1, ?)
             ON CONFLICT(id) DO UPDATE SET run_id = excluded.run_id`).run(runId);

  for (const s of legacy.steps ?? []) {
    if (!s?.agent) continue;
    h.prepare(`INSERT OR REPLACE INTO run_steps
                 (run_id, agent, status, output, round, note, human_approved, approved_by, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(runId, s.agent, s.status ?? "pending", s.output ?? null, s.round ?? null, s.note ?? null,
        s.human_approved ? 1 : 0, s.approved_by ?? null, s.updated_at ?? now());
  }

  const parked = `${LEGACY_STATE_FILE}.imported`;
  renameSync(LEGACY_STATE_FILE, parked);
  console.log(`[memory] Đã nhập trạng thái cũ từ workflow.json vào ${RUNS_DB} (run "${runId}") và đổi tên file cũ thành ${path.basename(parked)}.`);
}

/** run_id must be readable in a log line and safe as a filename component. */
function slug(text, max = 48) {
  const cleaned = String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")     // drop Vietnamese diacritics instead of turning each into "-"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || "adhoc").slice(0, max).replace(/-+$/, "");
}

function stepFromRow(row) {
  return {
    agent: row.agent,
    status: row.status,
    output: row.output,
    round: row.round,
    note: row.note,
    human_approved: row.human_approved === 1,
    approved_by: row.approved_by,
    updated_at: row.updated_at,
  };
}

function currentRunRow() {
  const h = handle();
  const pointer = h.prepare(`SELECT run_id FROM session WHERE id = 1`).get();
  if (!pointer?.run_id) return null;
  return h.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(pointer.run_id) ?? null;
}

function setCurrentRun(runId) {
  handle().prepare(`INSERT INTO session (id, run_id) VALUES (1, ?)
                    ON CONFLICT(id) DO UPDATE SET run_id = excluded.run_id`).run(runId);
}

const EMPTY = { run_id: null, feature: null, created_at: null, status: null, steps: [] };

// ── public API ───────────────────────────────────────────────────────

/** State of the CURRENT run only. Same shape as the old JSON file, plus `status`. */
export async function loadState() {
  const run = currentRunRow();
  if (!run) return { ...EMPTY, steps: [] };
  const steps = handle()
    .prepare(`SELECT * FROM run_steps WHERE run_id = ? ORDER BY rowid`)   // rowid = pipeline order
    .all(run.run_id)
    .map(stepFromRow);
  return { run_id: run.run_id, feature: run.feature, created_at: run.created_at, status: run.status, steps };
}

/**
 * Write a whole state object back. Kept for API compatibility — nothing in the repo
 * calls it any more (markStep/approveStep cover every real case), and it cannot invent
 * a run: a state without run_id is a programming error, not a new session.
 */
export async function saveState(state) {
  if (!state?.run_id) {
    throw new Error(`saveState() cần state.run_id — mở phiên mới bằng startRun(feature) trước.`);
  }
  const h = handle();
  h.prepare(`INSERT INTO runs (run_id, feature, created_at, status) VALUES (?, ?, ?, ?)
             ON CONFLICT(run_id) DO UPDATE SET feature = excluded.feature, status = excluded.status`)
    .run(state.run_id, state.feature ?? null, state.created_at ?? now(), state.status ?? "active");
  setCurrentRun(state.run_id);
  for (const s of state.steps ?? []) {
    if (!s?.agent) continue;
    h.prepare(`INSERT OR REPLACE INTO run_steps
                 (run_id, agent, status, output, round, note, human_approved, approved_by, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(state.run_id, s.agent, s.status ?? "pending", s.output ?? null, s.round ?? null,
        s.note ?? null, s.human_approved ? 1 : 0, s.approved_by ?? null, now());
  }
  return loadState();
}

/** The run flow-2/flow-3 are currently working on, or null. */
export async function currentRun() {
  return currentRunRow();
}

export async function listRuns(limit = 10) {
  return handle().prepare(`SELECT * FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit);
}

/**
 * Steps of ANY run, not just the current session's.
 *
 * loadState() is deliberately scoped to the CURRENT run — that is what the pipeline needs,
 * and letting a node read another run's state would blur the session boundary that K exists
 * to draw. Supervision is the one legitimate cross-run reader: qa-leader's job there is to
 * look at every run at once (agents/qa-leader/tools/run-supervisor.js), which loadState()
 * cannot express.
 */
export async function stepsOfRun(runId) {
  if (!runId) return [];
  return handle()
    .prepare(`SELECT * FROM run_steps WHERE run_id = ? ORDER BY rowid`)
    .all(runId)
    .map(stepFromRow);
}

/**
 * Open a new run and make it the current session. Two runs of the same feature on the
 * same day get distinct ids (`…-r2`, `…-r3`) instead of colliding on the primary key.
 */
export async function startRun(feature) {
  const h = handle();
  const createdAt = now();
  const base = `${slug(feature)}-${createdAt.slice(0, 10)}`;
  let runId = base;
  for (let n = 2; h.prepare(`SELECT 1 FROM runs WHERE run_id = ?`).get(runId); n++) runId = `${base}-r${n}`;

  h.prepare(`INSERT INTO runs (run_id, feature, created_at, status) VALUES (?, ?, ?, 'active')`)
    .run(runId, feature ?? null, createdAt);
  setCurrentRun(runId);
  return loadState();
}

/** Close the current run. `blocked` is not a failure of the tool — it records that a
 *  human has to step in, which is exactly what the run history should remember. */
export async function finishRun(status = "done") {
  const run = currentRunRow();
  if (!run) return null;
  handle().prepare(`UPDATE runs SET status = ? WHERE run_id = ?`).run(status, run.run_id);
  return { ...run, status };
}

/**
 * A run must exist before a step can belong to one. An agent called directly (not
 * through a flow) has no run, so one is created — but it is announced, not silent:
 * an unnamed run in the history is a fact worth seeing, not something to hide.
 */
function ensureRun() {
  const existing = currentRunRow();
  if (existing) return existing;
  const createdAt = now();
  const runId = `adhoc-${createdAt.slice(0, 10)}-${createdAt.slice(11, 19).replace(/:/g, "")}`;
  handle().prepare(`INSERT INTO runs (run_id, feature, created_at, status) VALUES (?, NULL, ?, 'active')`)
    .run(runId, createdAt);
  setCurrentRun(runId);
  console.warn(`[memory] Chưa có phiên nào đang mở — đã tự tạo run "${runId}" (chưa gán feature). Chạy qua workflow/flow-2 để phiên có tên feature.`);
  return currentRunRow();
}

export async function markStep(agent, patch = {}) {
  const unknown = Object.keys(patch).filter(k => !STEP_FIELDS.includes(k));
  if (unknown.length) {
    throw new Error(
      `markStep("${agent}"): trường không hợp lệ [${unknown.join(", ")}]. ` +
      `Hợp lệ: ${STEP_FIELDS.join(", ")}. (Backend JSON cũ nhận mọi khoá rồi bỏ qua âm thầm.)`
    );
  }

  const run = ensureRun();
  const h = handle();
  const existing = h.prepare(`SELECT * FROM run_steps WHERE run_id = ? AND agent = ?`).get(run.run_id, agent);

  // Approval is granted for a SPECIFIC completed output. If the status or the output
  // changes afterwards, the old approval no longer refers to anything a human saw, so
  // it is dropped. Concretely: qa-automation done -> approved -> verifier says FIX ->
  // status becomes needs_rework -> new spec written -> done again. Keeping the tick
  // would let the re-generated spec through the gate that nobody re-checked.
  const approvalExplicit = patch.human_approved !== undefined;
  const statusChanged = patch.status !== undefined && patch.status !== existing?.status;
  const outputChanged = patch.output !== undefined && patch.output !== existing?.output;

  let approved = existing?.human_approved === 1;
  let approvedBy = existing?.approved_by ?? null;
  if (!approvalExplicit && (statusChanged || outputChanged)) {
    approved = false;
    approvedBy = null;
  }
  if (approvalExplicit) {
    approved = !!patch.human_approved;
    approvedBy = patch.approved_by ?? approvedBy;
  }

  h.prepare(`INSERT INTO run_steps
               (run_id, agent, status, output, round, note, human_approved, approved_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(run_id, agent) DO UPDATE SET
               status = excluded.status, output = excluded.output, round = excluded.round,
               note = excluded.note, human_approved = excluded.human_approved,
               approved_by = excluded.approved_by, updated_at = excluded.updated_at`)
    .run(
      run.run_id,
      agent,
      patch.status ?? existing?.status ?? "pending",
      patch.output ?? existing?.output ?? null,
      patch.round ?? existing?.round ?? null,
      patch.note ?? existing?.note ?? null,
      approved ? 1 : 0,
      approvedBy,
      now(),
    );

  return loadState();
}

export async function approveStep(agent, by) {
  const run = currentRunRow();
  if (!run) throw new Error(`Chưa có phiên nào để duyệt. Chạy workflow/flow-2 trước.`);
  const exists = handle().prepare(`SELECT 1 FROM run_steps WHERE run_id = ? AND agent = ?`).get(run.run_id, agent);
  if (!exists) {
    throw new Error(
      `Run "${run.run_id}" không có bước "${agent}" — không duyệt được một bước chưa từng chạy.\n` +
      `  Xem các bước đang có: node agents/approve.js`
    );
  }
  return markStep(agent, { human_approved: true, approved_by: by });
}

/** Human-Final: the next node must not run until a person has approved this one. */
export async function requireApproved(agent) {
  const state = await loadState();
  if (!state.run_id) {
    throw new Error(`Chưa có phiên nào đang mở. Chạy workflow/flow-2-leader-analyst.js trước.`);
  }
  const step = state.steps.find(s => s.agent === agent);
  if (!step || step.status !== "done") {
    throw new Error(`Run "${state.run_id}": bước "${agent}" chưa hoàn thành (status: ${step?.status ?? "chưa chạy"}). Chạy bước đó trước.`);
  }
  if (!step.human_approved) {
    throw new Error(
      `Run "${state.run_id}": bước "${agent}" đã xong nhưng CHƯA ĐƯỢC DUYỆT.\n` +
      `  Mở file: ${step.output ?? "(bước này không khai output)"}\n` +
      `  Duyệt bằng: node agents/approve.js ${agent} "<tên bạn>"`
    );
  }
  return step;
}

export async function printState() {
  const state = await loadState();
  const runs = await listRuns(10);

  if (!state.run_id) {
    console.log(runs.length ? "Chưa có phiên hiện tại (session trống)." : "No run yet.");
  } else {
    console.log(`\nRUN: ${state.run_id}  (${state.feature ?? "chưa gán feature"})  [${state.status}]`);
    if (state.steps.length === 0) console.log("  (chưa có bước nào)");
    for (const s of state.steps) {
      const gate = s.human_approved ? `approved by ${s.approved_by}` : "WAITING FOR APPROVAL";
      console.log(`  [${String(s.status).padEnd(12)}] ${s.agent.padEnd(16)} ${s.output ?? "-"}  | ${gate}`);
    }
  }

  const previous = runs.filter(r => r.run_id !== state.run_id);
  if (previous.length) {
    console.log(`\nLỊCH SỬ (${previous.length} run trước, mới nhất trước):`);
    for (const r of previous) {
      console.log(`  ${String(r.created_at).slice(0, 19)}  [${String(r.status).padEnd(7)}] ${r.run_id}  ${r.feature ?? ""}`);
    }
  }
  console.log("");
}
