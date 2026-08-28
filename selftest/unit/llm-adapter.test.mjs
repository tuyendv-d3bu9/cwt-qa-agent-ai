// Test R3: HAI adapter LLM, MỘT hợp đồng.
//
// VÌ SAO BỘ NÀY TỒN TẠI. `llm.js` giờ có hai đường bên dưới (Gemini SDK gốc, và thư viện
// `openai` cho mọi provider còn lại). Hai đường làm cùng một việc mà không có bộ test chung thì
// chúng **lệch âm thầm**: một bên trả `functionCalls` có `args`, bên kia trả chuỗi JSON chưa
// parse; một bên có `usage`, bên kia `null`. Triệu chứng sẽ hiện ra ở một agent nào đó, cách
// nguyên nhân vài tầng.
//
// CÁCH TEST: cùng một đầu vào, chạy qua CẢ HAI adapter, so hình dạng đầu ra.
//   - Gemini: SDK giả (tiêm qua `_sdk`) — không có endpoint công khai nào để dựng giả.
//   - OpenAI-compat: **server `node:http` THẬT** nói đúng giao thức OpenAI, và thư viện `openai`
//     thật nói chuyện với nó. Nhờ vậy bộ này kiểm cả phần tích hợp SDK, không chỉ hàm dịch.

import path from "node:path";
import http from "node:http";
const abs = (p) => "file:///" + path.resolve(process.cwd(), p).split(path.sep).join("/");
const G = await import(abs("agents/runtime/adapters/gemini.js"));
const O = await import(abs("agents/runtime/adapters/openai-compat.js"));
const C = await import(abs("agents/runtime/llm-config.js"));

const T = [];
const chk = (n, c, e = "") => T.push([n, c, e]);

// ── Server giả nói giao thức OpenAI ───────────────────────────────────
let lastBody = null;
const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", d => { raw += d; });
    req.on("end", () => {
        lastBody = raw ? JSON.parse(raw) : null;
        res.setHeader("content-type", "application/json");

        if (req.url.includes("/models")) {
            res.end(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }));
            return;
        }
        // Có tool trong body → trả lượt gọi tool; không thì trả text.
        const wantsTool = Array.isArray(lastBody?.tools) && lastBody.tools.length > 0;
        const message = wantsTool
            ? {
                role: "assistant", content: null,
                tool_calls: [{ id: "call_abc", type: "function", function: { name: "read_file", arguments: '{"path":"a.md"}' } }],
            }
            : { role: "assistant", content: "xin chào" };
        res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 7, completion_tokens: 3 } }));
    });
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

const cfgOpenAI = { provider: "openai", adapter: "openai-compat", baseUrl, apiKey: "test-key", model: "m1", visionModel: "m1" };
const cfgGemini = { provider: "gemini", adapter: "gemini", baseUrl: null, apiKey: "k", model: "g1", visionModel: "g1" };

// SDK Gemini giả — trả về đúng hình dạng @google/genai.
const fakeGeminiSdk = (res) => ({ models: { generateContent: async (req) => { fakeGeminiSdk.last = req; return res; } } });

const SYSTEM = "bạn là QA";
const CONTENTS = [{ role: "user", parts: [{ text: "phân tích đi" }] }];
const TOOLS = [{ name: "read_file", description: "đọc file", parameters: { type: "object", properties: { path: { type: "string" } } } }];

// ─────────── 1. Trả lời text: HAI adapter cùng hình dạng ───────────
{
    const gem = await G.chat({
        cfg: cfgGemini, system: SYSTEM, contents: CONTENTS,
        _sdk: fakeGeminiSdk({ text: "xin chào", functionCalls: [], candidates: [{ content: { role: "model", parts: [{ text: "xin chào" }] } }], usageMetadata: { promptTokenCount: 7 } }),
    });
    const oai = await O.chat({ cfg: cfgOpenAI, system: SYSTEM, contents: CONTENTS });

    for (const [name, r] of [["gemini", gem], ["openai-compat", oai]]) {
        chk(`${name}: trả về text`, r.text === "xin chào", JSON.stringify(r.text));
        chk(`${name}: functionCalls là MẢNG (rỗng), không phải null/undefined`,
            Array.isArray(r.functionCalls) && r.functionCalls.length === 0, JSON.stringify(r.functionCalls));
        chk(`${name}: có \`content\` để echo lại lượt của model`, r.content != null, JSON.stringify(r.content));
        chk(`${name}: có \`usage\``, r.usage != null, JSON.stringify(r.usage));
    }
    chk(">>> HAI adapter trả về CÙNG BỘ KHOÁ (lệch khoá = agent hỏng ở một tầng xa nguyên nhân)",
        Object.keys(gem).sort().join(",") === Object.keys(oai).sort().join(","),
        JSON.stringify({ gemini: Object.keys(gem).sort(), openai: Object.keys(oai).sort() }));
}

// ─────────── 2. Model gọi tool: cùng hình dạng functionCalls ───────────
{
    const gem = await G.chat({
        cfg: cfgGemini, system: SYSTEM, contents: CONTENTS, tools: TOOLS,
        _sdk: fakeGeminiSdk({
            text: "", functionCalls: [{ name: "read_file", args: { path: "a.md" } }],
            candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "read_file", args: { path: "a.md" } }, thoughtSignature: "SIG-123" }] } }],
            usageMetadata: {},
        }),
    });
    const oai = await O.chat({ cfg: cfgOpenAI, system: SYSTEM, contents: CONTENTS, tools: TOOLS });

    for (const [name, r] of [["gemini", gem], ["openai-compat", oai]]) {
        chk(`${name}: functionCalls[0].name`, r.functionCalls[0]?.name === "read_file", JSON.stringify(r.functionCalls));
        chk(`${name}: args ĐÃ PARSE thành object, không phải chuỗi JSON`,
            r.functionCalls[0]?.args?.path === "a.md", JSON.stringify(r.functionCalls[0]?.args));
    }

    // Hai lý do khác nhau, cùng một hậu quả: mất `content` là hỏng ở LƯỢT THỨ HAI.
    chk(">>> gemini: `content` giữ nguyên `thoughtSignature` (mất nó → 400 ở lượt sau)",
        JSON.stringify(gem.content).includes("SIG-123"), JSON.stringify(gem.content));
    chk(">>> openai-compat: `content` giữ nguyên `tool_calls[].id` (mất nó → không khớp tool_call_id)",
        oai.content?.tool_calls?.[0]?.id === "call_abc", JSON.stringify(oai.content));

    // Khai báo tool phải tới được server đúng dạng OpenAI.
    chk("openai-compat: tool gửi đi đúng dạng {type:'function', function:{name}}",
        lastBody?.tools?.[0]?.type === "function" && lastBody.tools[0].function.name === "read_file",
        JSON.stringify(lastBody?.tools));
}

// ─────────── 3. Dịch hội thoại: Gemini contents → OpenAI messages ───────────
{
    const msgs = O.toMessages("SYS", [
        { role: "user", parts: [{ text: "hỏi" }] },
        { role: "model", parts: [{ functionCall: { id: "c1", name: "read_file", args: { path: "x" } } }] },
        { role: "user", parts: [{ functionResponse: { id: "c1", name: "read_file", response: { content: "nội dung" } } }] },
    ]);
    chk("system thành messages[0]", msgs[0].role === "system" && msgs[0].content === "SYS", JSON.stringify(msgs[0]));
    chk("role 'model' của Gemini → 'assistant' của OpenAI", msgs[2].role === "assistant", JSON.stringify(msgs[2]));
    chk("functionCall → tool_calls, arguments là CHUỖI JSON",
        msgs[2].tool_calls?.[0]?.function?.arguments === '{"path":"x"}', JSON.stringify(msgs[2].tool_calls));
    chk(">>> functionResponse → message riêng role:'tool' mang tool_call_id KHỚP với id lúc gọi",
        msgs[3].role === "tool" && msgs[3].tool_call_id === "c1", JSON.stringify(msgs[3]));

    // Message đã đúng dạng OpenAI thì truyền thẳng, không bọc lại lần nữa.
    const passthru = O.toMessages(null, [{ role: "user", content: "thẳng" }]);
    chk("message đã đúng dạng OpenAI được truyền thẳng", passthru[0].content === "thẳng", JSON.stringify(passthru));
}
{
    // `arguments` hỏng JSON: KHÔNG ném — vòng gọi tool ở tầng trên biết cách báo cho model sửa.
    const calls = O.toFunctionCalls({ tool_calls: [{ id: "c", type: "function", function: { name: "f", arguments: "{khong-phai-json" } }] });
    chk(">>> arguments hỏng JSON → args={} kèm _raw, KHÔNG làm sập cả lượt chạy",
        calls[0].args && Object.keys(calls[0].args).length === 0 && calls[0]._raw?.includes("khong-phai-json"),
        JSON.stringify(calls));
}

// ─────────── 4. Vision: cùng hợp đồng ───────────
{
    const img = [{ mimeType: "image/jpeg", base64: "AAAA" }];
    const gem = await G.vision({ cfg: cfgGemini, system: "S", text: "mô tả", images: img, _sdk: fakeGeminiSdk({ text: "thấy nút", usageMetadata: {} }) });
    const oai = await O.vision({ cfg: cfgOpenAI, system: "S", text: "mô tả", images: img });

    chk("gemini vision: gửi inlineData",
        JSON.stringify(fakeGeminiSdk.last?.contents).includes("inlineData"), JSON.stringify(fakeGeminiSdk.last?.contents)?.slice(0, 120));
    chk(">>> openai vision: ảnh thành data: URI trong image_url",
        String(lastBody?.messages?.at(-1)?.content?.[1]?.image_url?.url).startsWith("data:image/jpeg;base64,"),
        JSON.stringify(lastBody?.messages?.at(-1)?.content?.[1] ?? null));
    chk("hai adapter cùng bộ khoá cho vision",
        Object.keys(gem).sort().join(",") === Object.keys(oai).sort().join(","),
        JSON.stringify([Object.keys(gem), Object.keys(oai)]));
}

// ─────────── 5. listModels ───────────
{
    const ids = await O.listModels({ cfg: cfgOpenAI });
    chk("listModels đọc được /v1/models", ids.join(",") === "model-a,model-b", ids.join(","));
}

// ─────────── 6. Cấu hình ───────────
{
    const cfg = C.resolveLlmConfig({ LLM_PROVIDER: "groq", LLM_API_KEY: "k", LLM_MODEL: "llama-3.3-70b" }, () => { });
    chk("provider groq lấy baseUrl mặc định", cfg.baseUrl === "https://api.groq.com/openai/v1", cfg.baseUrl);
    chk("groq đi đường openai-compat", cfg.adapter === "openai-compat", cfg.adapter);
    chk("LLM_MODEL_VISION để trống → dùng lại LLM_MODEL", cfg.visionModel === "llama-3.3-70b", cfg.visionModel);

    const custom = C.resolveLlmConfig({ LLM_PROVIDER: "openai", LLM_BASE_URL: "http://x/v1", LLM_API_KEY: "k", LLM_MODEL: "m" }, () => { });
    chk("LLM_BASE_URL đè lên mặc định của provider", custom.baseUrl === "http://x/v1", custom.baseUrl);

    // Biến CŨ phải còn chạy — `.env` của học viên không được chết vì bản nâng cấp.
    const warns = [];
    const old = C.resolveLlmConfig({ GEMINI_API_KEY: "cu", GEMINI_MODEL: "gemini-2.0" }, (m) => warns.push(m));
    chk(">>> .env CŨ (GEMINI_API_KEY/GEMINI_MODEL) vẫn chạy được",
        old.provider === "gemini" && old.apiKey === "cu" && old.model === "gemini-2.0", JSON.stringify(old));
    chk("và có CẢNH BÁO nhắc đổi tên (im lặng = hai tên cùng tồn tại mãi mãi)",
        warns.length === 1 && /GEMINI_API_KEY/.test(warns[0]), JSON.stringify(warns));

    let err = null;
    try { C.resolveLlmConfig({ LLM_PROVIDER: "khong-co-that", LLM_API_KEY: "k", LLM_MODEL: "m" }, () => { }); } catch (e) { err = e; }
    chk("provider lạ → nêu danh sách đang hỗ trợ", err?.name === "LlmConfigError" && /groq/.test(err.message), String(err));

    err = null;
    try { C.resolveLlmConfig({ LLM_PROVIDER: "openai", LLM_MODEL: "m" }, () => { }); } catch (e) { err = e; }
    chk("thiếu khoá → nói rõ đặt biến nào", err?.name === "LlmConfigError" && /LLM_API_KEY/.test(err.message), String(err));

    chk("ollama không cần khoá (chạy máy mình)",
        C.resolveLlmConfig({ LLM_PROVIDER: "ollama", LLM_MODEL: "qwen" }, () => { }).apiKey === "ollama");
}

// ─────────── 7. Khoá cache phải tách theo provider ───────────
{
    const groq = C.cacheIdentity(C.resolveLlmConfig({ LLM_PROVIDER: "groq", LLM_API_KEY: "k", LLM_MODEL: "llama-3.3-70b" }, () => { }));
    const together = C.cacheIdentity(C.resolveLlmConfig({ LLM_PROVIDER: "together", LLM_API_KEY: "k", LLM_MODEL: "llama-3.3-70b" }, () => { }));
    chk(">>> CÙNG tên model trên HAI provider → khoá cache KHÁC nhau (nếu không, chúng ăn cache của nhau)",
        JSON.stringify(groq) !== JSON.stringify(together), JSON.stringify([groq, together]));
    chk("khoá cache KHÔNG chứa apiKey (cache ghi ra đĩa dạng JSON)",
        !JSON.stringify(groq).includes("k"), JSON.stringify(groq));
}

server.close();

let bad = 0;
for (const [n, c, e] of T) { if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + n + (e && !c ? "   → " + String(e).slice(0, 200) : "")); }
console.log(`\nllm-adapter: ${T.length - bad}/${T.length}`);
process.exit(bad === 0 ? 0 : 1);
