import { callLLM } from "./llm.js";
import { declarationsFor, runTool } from "./tools.js";

export async function runAgent({
  name,
  system,
  task,
  toolNames = [],
  maxSteps = 15,
  useCache = true,
  verbose = true,
}) {
  const tools = declarationsFor(toolNames);
  const contents = [{ role: "user", parts: [{ text: task }] }];

  const log = (...a) => verbose && console.log(...a);
  log(`\n=== AGENT: ${name} ===`);

  for (let step = 1; step <= maxSteps; step++) {
    const res = await callLLM({ system, contents, tools, useCache });

    if (res.fromCache) log(`  [Step ${step}] (Using cache)`);

    // --- Model call tool ---
    if (res.functionCalls.length > 0) {
      contents.push({
        role: "model",
        parts: res.functionCalls.map(fc => ({ functionCall: fc })),
      });

      const responseParts = [];
      for (const fc of res.functionCalls) {
        log(`  [Step ${step}] call tool: ${fc.name}(${JSON.stringify(fc.args).slice(0, 90)})`);
        const result = await runTool(fc.name, fc.args);
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      }

      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    // --- Model return text -> end ---
    log(`  [Step ${step}] return text (${res.text.length} characters)`);
    return { text: res.text, steps: step, fromCache: res.fromCache };
  }

  throw new Error(
    `Agent "${name}" exceeds ${maxSteps} steps.\n` +
    `Usually because the skill description is not clear.`
  );
}
