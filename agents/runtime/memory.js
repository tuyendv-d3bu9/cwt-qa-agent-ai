// agents/runtime/memory.js

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_FILE = path.resolve(process.cwd(), "memory/working/workflow.json");

const EMPTY = { run_id: null, feature: null, created_at: null, steps: [] };

export async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return { ...EMPTY, steps: [] };
  }
}

export async function saveState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  return state;
}

export async function startRun(feature) {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const state = {
    run_id: `${feature.replace(/\s+/g, "-")}-${stamp}`,
    feature,
    created_at: now.toISOString(),
    steps: [],
  };
  return saveState(state);
}

export async function markStep(agent, patch) {
  const state = await loadState();
  let step = state.steps.find(s => s.agent === agent);
  if (!step) {
    step = { agent, status: "pending", output: null, human_approved: false };
    state.steps.push(step);
  }
  Object.assign(step, patch, { updated_at: new Date().toISOString() });
  return saveState(state);
}

export async function approveStep(agent, by) {
  return markStep(agent, { human_approved: true, approved_by: by });
}

// Human-Final: agent sau khong duoc chay neu buoc truoc chua co nguoi duyet.
export async function requireApproved(agent) {
  const state = await loadState();
  const step = state.steps.find(s => s.agent === agent);
  if (!step || step.status !== "done") {
    throw new Error(`Step "${agent}" not completed. Run that step first.`);
  }
  if (!step.human_approved) {
    throw new Error(
      `Step "${agent}" has been completed but NOT APPROVED.\n` +
      `  Open file: ${step.output}\n` +
      `  Approve by running: node agents/approve.js ${agent} "<your name>"`
    );
  }
  return step;
}

export async function printState() {
  const state = await loadState();
  if (!state.run_id) return console.log("No run yet.");
  console.log(`\nRUN: ${state.run_id}  (${state.feature})`);
  for (const s of state.steps) {
    const gate = s.human_approved ? `approved by ${s.approved_by}` : "WAITING FOR APPROVAL";
    console.log(`  [${s.status.padEnd(7)}] ${s.agent.padEnd(14)} ${s.output ?? "-"}  | ${gate}`);
  }
  console.log("");
}
