// agents/runtime/loop.js
// Generic loop engines shared across workflow/flow-*.js and agent index.js files.
//
// Previously this file held `runAgent()` — a Gemini native function-calling loop
// over a static tool registry (tools.js). No agent ever used it: every real
// tool-loop need in this repo (MCP tools from a live listTools() call, not a
// static declared schema) didn't fit that shape, so it was reinvented ad hoc
// each time instead (see qa-automation's old inline executeSteps(), and the
// round-retry loop duplicated twice in workflow/leader-analyst.js). The two
// functions below extract those actual repeated shapes instead.

/**
 * runRoundLoop — the PASS/FIX/ASK round-retry pattern (Leader/Analyst style
 * review cycles). Produces something, reviews it, and either stops (ASK/PASS)
 * or feeds back and retries (FIX), up to maxRounds.
 *
 * @param {number}   startRound - round number to start at (for resuming after ASK)
 * @param {number}   maxRounds
 * @param {(round) => Promise<void>} produce - generate/update the artifact for this round
 * @param {(round) => Promise<{verdict: "PASS"|"FIX"|"ASK", reportMarkdown: string}>} review
 * @param {(round, reportMarkdown) => Promise<void>} onAsk
 * @param {(round) => Promise<void>} onPass
 * @param {(round, reportMarkdown) => Promise<void>} onFix
 * @param {() => Promise<void>} onBlocked - called once maxRounds is exceeded without PASS/ASK
 * @returns {Promise<{verdict: "PASS"|"ASK"|"BLOCKED", round: number}>}
 */
export async function runRoundLoop({ startRound = 1, maxRounds, produce, review, onAsk, onPass, onFix, onBlocked }) {
  for (let round = startRound; round <= maxRounds; round++) {
    await produce(round);
    const { verdict, reportMarkdown } = await review(round);

    if (verdict === "ASK") {
      await onAsk(round, reportMarkdown);
      return { verdict, round };
    }

    if (verdict === "PASS") {
      await onPass(round);
      return { verdict, round };
    }

    // FIX — feed back and retry
    await onFix(round, reportMarkdown);
  }

  await onBlocked();
  return { verdict: "BLOCKED", round: maxRounds };
}

/**
 * runStepLoop — the step-decision pattern (qa-automation's Steps-execution).
 * For each step, asks a decision function what action (if any) to take, then
 * executes it. Tool-agnostic: `decide`/`execute` are injected closures, so this
 * works whether actions come from a local tool registry or a live MCP
 * connection's listTools() — no static schema required.
 *
 * @param {Array}    steps
 * @param {(step) => Promise<{tool: string|null, args?: object} | null>} decide
 * @param {(decision, step) => Promise<void>} execute - only called when decide() returns a tool
 */
export async function runStepLoop({ steps, decide, execute }) {
  for (const step of steps) {
    const decision = await decide(step);
    if (decision?.tool) {
      await execute(decision, step);
    }
  }
}
