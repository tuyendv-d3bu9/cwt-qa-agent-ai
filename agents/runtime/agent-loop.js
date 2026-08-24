// agents/runtime/agent-loop.js
// The observe -> act -> observe loop. This is what makes a node an AGENT rather than a
// prompt template.
//
// WHAT IT REPLACES. All 27 LLM call-sites across the 6 agents had exactly one shape:
//
//     contents: [{ role: "user", parts: [{ text: userText }] }]     // 1 phần tử, LUÔN role user
//     -> callLLM -> text -> regex/JSON.parse -> write a .md file -> done
//
// So the model never saw a tool, never saw the RESULT of anything it did, and never got a
// second chance. The only way nodes "remembered" each other was JS pasting a previous
// output into the next prompt as a string. That is data passing, not context.
//
// WHY THE PREVIOUS ATTEMPT WAS DELETED, and what is different here. loop.js used to hold
// runAgent(), a Gemini function-calling loop hard-wired to the static tools.js registry.
// Its own removal note says no agent ever used it, because the real tool-loop need in this
// repo is MCP tools discovered at runtime via listTools() — which a static registry cannot
// express. Hence `execute` here is an INJECTED closure: one loop serves file tools
// (runTool), MCP tools (client.callTool), or a test fake, and none of them is privileged.
//
// FOUR THINGS THIS LOOP REFUSES TO DO SILENTLY:
//   1. run forever            -> maxSteps caps tool calls; exhaustion is REPORTED, not hidden
//   2. accept a bad answer    -> selfCheck is deterministic; failure is fed back as a turn
//   3. loop on a broken tool  -> a repeated identical failing call is stopped and named
//   4. hide its cost          -> every step/token is counted and returned
//
// COST. Each iteration re-sends the whole `contents` array, so cost grows quadratically in
// the number of steps. maxSteps is therefore a real budget, not a safety net —
// see agents/qa-automation/knowledge/mcp-cost-optimization.md.

import { callLLM } from "./llm.js";

/** Stable key for "the model asked for the same thing again" detection. */
function callSignature(call) {
    return `${call.name}(${JSON.stringify(call.args ?? {})})`;
}

/**
 * A tool result has to travel back into the conversation as text. Errors stay VISIBLE —
 * the whole point is that the agent sees its own failure and can react. Swallowing the
 * error here would put us right back to blind single-shot behaviour.
 */
function resultToText(name, result) {
    try {
        return JSON.stringify(result);
    } catch {
        // Circular/non-serialisable result: say so rather than sending "undefined".
        return JSON.stringify({ error: `Kết quả của tool "${name}" không serialize được thành JSON.` });
    }
}

/**
 * @param {object}   o
 * @param {string}   o.system        - role.md + knowledge + skill, as today
 * @param {string}   o.task          - the user-turn text that starts the work
 * @param {Array}    o.tools         - Gemini functionDeclarations (tools.js declarationsFor(), or
 *                                     an MCP listTools() mapping). Empty array = no tools, in which
 *                                     case this degrades to single-shot + selfCheck revision.
 * @param {(name: string, args: object) => Promise<any>} o.execute
 *                                   - runs one tool call. INJECTED so file tools and MCP tools
 *                                     both work. Should RESOLVE with an {error} object rather than
 *                                     throw, so the agent can see and handle the failure; a throw
 *                                     is also caught and turned into a visible error.
 * @param {(text: string) => Promise<{ok: boolean, issues?: string[]}> | {ok: boolean, issues?: string[]}} [o.selfCheck]
 *                                   - DETERMINISTIC gate on the final answer. This is where
 *                                     count-check.js / coverage-check.js / spec-assertion-check.js
 *                                     stop being "notes for a human to read" and start forcing a fix.
 * @param {number}   [o.maxSteps=8]      - hard cap on tool calls for the whole run
 * @param {number}   [o.maxRevisions=2]  - how many times a selfCheck failure is fed back
 * @param {string}   [o.label=""]        - name used in log lines
 * @param {boolean}  [o.verbose=true]
 * @param {Function} [o.llm=callLLM]     - injectable for tests
 *
 * @returns {Promise<{
 *   text: string, ok: boolean, exhausted: null|"steps"|"revisions",
 *   steps: number, revisions: number, toolCalls: Array, issues: string[],
 *   contents: Array, usage: {promptTokens: number, outputTokens: number, llmCalls: number}
 * }>}
 *   `ok` is the selfCheck verdict — false with `exhausted` set means the budget ran out
 *   before the answer was acceptable. Callers MUST look at it; treating a returned `text`
 *   as good news regardless is exactly the blindness this module exists to remove.
 */
export async function runAgentLoop({
    system,
    task,
    tools = [],
    execute,
    selfCheck,
    maxSteps = 8,
    maxRevisions = 2,
    label = "",
    verbose = true,
    llm = callLLM,
}) {
    if (tools.length > 0 && typeof execute !== "function") {
        throw new Error(`runAgentLoop(${label}): có khai báo ${tools.length} tool nhưng thiếu execute() để chạy chúng.`);
    }

    const contents = [{ role: "user", parts: [{ text: task }] }];
    const toolCalls = [];
    const usage = { promptTokens: 0, outputTokens: 0, llmCalls: 0 };
    const tag = label ? `[${label}] ` : "";

    let steps = 0;
    let revisions = 0;
    let lastText = "";
    let issues = [];
    // Guards against burning the whole budget re-issuing one call that keeps failing.
    let lastFailedSignature = null;

    for (;;) {
        const res = await llm({ system, contents, tools });
        usage.llmCalls++;
        usage.promptTokens += res.usage?.promptTokenCount ?? 0;
        usage.outputTokens += res.usage?.candidatesTokenCount ?? 0;

        const calls = res.functionCalls ?? [];

        // ── The model wants to act ────────────────────────────────────────
        if (calls.length > 0) {
            if (steps + calls.length > maxSteps) {
                if (verbose) console.warn(`${tag}Hết ngân sách ${maxSteps} bước tool — dừng, KHÔNG chạy thêm.`);
                return finish({ exhausted: "steps" });
            }

            // Record the model's turn VERBATIM — the raw candidate content, not a turn
            // rebuilt from {name, args}. Two reasons, both load-bearing:
            //   1. without any model turn, the next request has no record of what was asked
            //      and the model re-asks forever;
            //   2. Gemini 3 attaches a `thoughtSignature` to functionCall parts and returns
            //      400 INVALID_ARGUMENT if the echoed-back turn is missing it. Rebuilding
            //      the part drops the signature, so EVERY tool conversation died on its
            //      second turn. Found by running it for real; no offline test caught it,
            //      because a fake LLM has no signatures to lose.
            // The fallback keeps test fakes (which return no `content`) working.
            contents.push(
                res.content ??
                { role: "model", parts: calls.map(c => ({ functionCall: { name: c.name, args: c.args ?? {} } })) }
            );

            const responseParts = [];
            for (const call of calls) {
                steps++;
                let result;
                try {
                    result = await execute(call.name, call.args ?? {});
                } catch (err) {
                    result = { error: String(err?.message ?? err) };
                }

                const signature = callSignature(call);
                const failed = result && typeof result === "object" && "error" in result;
                if (failed && signature === lastFailedSignature) {
                    result = {
                        error: `${result.error} — ĐÂY LÀ LẦN THỨ HAI gọi y hệt lời gọi này và vẫn lỗi. ` +
                            `Đừng gọi lại lần nữa: đổi cách làm, hoặc kết luận rằng không làm được và nói rõ vì sao.`,
                    };
                }
                lastFailedSignature = failed ? signature : null;

                toolCalls.push({ step: steps, name: call.name, args: call.args ?? {}, failed: Boolean(failed) });
                if (verbose) console.log(`${tag}bước ${steps}/${maxSteps}: ${call.name}${failed ? " -> LỖI" : ""}`);

                responseParts.push({
                    functionResponse: { name: call.name, response: { result: resultToText(call.name, result) } },
                });
            }

            // THE line this whole module exists for: the agent now sees what happened.
            contents.push({ role: "user", parts: responseParts });
            continue;
        }

        // ── No tool call: this is the answer ──────────────────────────────
        lastText = res.text ?? "";
        const check = selfCheck ? await selfCheck(lastText) : { ok: true };
        issues = check.issues ?? [];

        if (check.ok) return finish({ exhausted: null });

        if (revisions >= maxRevisions) {
            if (verbose) console.warn(`${tag}Đã sửa ${revisions} lần vẫn chưa đạt self-check — dừng và báo rõ, KHÔNG coi là xong.`);
            return finish({ exhausted: "revisions" });
        }

        revisions++;
        if (verbose) console.warn(`${tag}Self-check CHƯA ĐẠT (lần sửa ${revisions}/${maxRevisions}): ${issues.join(" ")}`);

        // Feed the violation back as a real conversational turn. The model keeps its own
        // previous answer in `contents`, so it revises rather than starting from scratch.
        contents.push({ role: "model", parts: [{ text: lastText }] });
        contents.push({
            role: "user",
            parts: [{
                text: `Bản trả lời vừa rồi CHƯA ĐẠT kiểm tra tự động. Vi phạm:\n` +
                    issues.map(i => `- ${i}`).join("\n") +
                    // "BẢN ĐẦY ĐỦ" alone was ambiguous and cost real money to learn: the model
                    // read it as "the whole document" and concatenated the material it had been
                    // GIVEN as input (the previous step's output) onto its own answer. Three
                    // chained steps turned a 13.5KB deliverable into 44KB with every section
                    // repeated three times — and the gates passed, because the duplicated blob
                    // did contain enough rows to satisfy the counts.
                    `\n\nSửa lại và trả về bản hoàn chỉnh CỦA CHÍNH PHẦN BẠN VỪA VIẾT — ` +
                    `đúng một nội dung đó, đúng định dạng đó, không phải chỉ đoạn sửa.\n` +
                    `TUYỆT ĐỐI KHÔNG chép lại nội dung đã được cung cấp cho bạn trong phần input ` +
                    `(tóm tắt requirement, kết quả bước trước, tài liệu dự án...) vào câu trả lời. ` +
                    `Không giải thích, không xin lỗi. Nếu một vi phạm không thể sửa được thì nói rõ vì sao thay vì bỏ qua.`,
            }],
        });
    }

    function finish({ exhausted }) {
        return {
            text: lastText,
            ok: exhausted === null,
            exhausted,
            steps,
            revisions,
            toolCalls,
            issues,
            contents,
            usage,
        };
    }
}

/**
 * Adapter: TOOLS registry -> `execute`. Kept here rather than in tools.js so tools.js has
 * no idea an agent loop exists (it is also called directly by plain JS).
 * runTool already returns {error} instead of throwing, which is the shape the loop wants.
 */
export function fileToolExecutor(runTool, allowed) {
    const allowedSet = new Set(allowed);
    return async (name, args) => {
        // Defence in depth: Gemini should only ever call a declared tool, but an agent must
        // not be able to reach a tool its author did not grant just because the model asked.
        if (!allowedSet.has(name)) {
            return { error: `Tool "${name}" không nằm trong danh sách được phép của node này (${[...allowedSet].join(", ")}).` };
        }
        return runTool(name, args);
    };
}
