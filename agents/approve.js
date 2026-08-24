// agents/approve.js
// The human half of the Human-Final gate: mark one node's deliverable as reviewed so
// the flow runner will let the next node run. Called with no arguments it is also the
// "what state am I in?" command — current run, its steps, and previous runs.
import "dotenv/config";
import { approveStep, printState } from "./runtime/memory.js";

const [, , agent, who] = process.argv;

if (!agent || !who) {
  console.log('Usage: node agents/approve.js <agent-name> "Your Name"');
  console.log('       node agents/approve.js            (chỉ xem trạng thái phiên + lịch sử)');
  await printState();
  // No arguments is a legitimate "show me the state" call, not a usage error.
  process.exit(agent || who ? 1 : 0);
}

try {
  await approveStep(agent, who);
} catch (err) {
  // Approving a step that does not exist in this run used to succeed silently: the old
  // JSON backend created the step on the fly, so a typo'd agent name produced an
  // approved step nobody had run.
  console.error(`\n>> Không duyệt được: ${err.message}\n`);
  await printState();
  process.exit(1);
}

console.log(`Step "${agent}" has been approved by ${who}.`);
await printState();
