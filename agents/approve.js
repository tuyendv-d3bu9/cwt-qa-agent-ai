import "dotenv/config";
import { approveStep, printState } from "./runtime/memory.js";

const [, , agent, who] = process.argv;
if (!agent || !who) {
  console.log('Usage: node agents/approve.js <agent-name> "Your Name"');
  await printState();
  process.exit(1);
}

await approveStep(agent, who);
console.log(`Step "${agent}" has been approved by ${who}.`);
await printState();
