// agents/runtime/adapters/openai-compat.js
// R3 — adapter cho MỌI provider nói giao thức OpenAI: openai, groq, openrouter, deepseek,
// together, ollama, lmstudio, và bất kỳ endpoint nào khác qua `LLM_BASE_URL`.
//
// Việc của file này là DỊCH, và bảng dịch chính là phần khó của R3:
//
//   khái niệm            Gemini                          OpenAI-compat
//   ────────────────────────────────────────────────────────────────────────────────
//   system               config.systemInstruction        messages[0] = {role:'system'}
//   hội thoại            contents[{role, parts:[{text}]}]  messages[{role, content}]
//   khai báo tool        functionDeclarations            tools:[{type:'function', function:{…}}]
//   model gọi tool       res.functionCalls               choices[0].message.tool_calls
//   trả kết quả tool     parts:[{functionResponse}]      {role:'tool', tool_call_id}
//   lượt của model       candidates[0].content           choices[0].message
//
// ⚠ `content` trả về là KHỐI NGUYÊN BẢN của provider để echo lại, giống hệt bên Gemini. Ở đây lý
// do khác nhưng hậu quả như nhau: `tool_calls[].id` phải khớp với `tool_call_id` của message
// `role:'tool'` ở lượt sau. Dựng lại message từ `functionCalls` là mất id đó, và provider từ
// chối — cũng ở LƯỢT THỨ HAI, không phải lượt đầu.

let _client = null;

async function client(cfg) {
    const key = `${cfg.apiKey}|${cfg.baseUrl}`;
    if (_client && _client.__key === key) return _client;
    let OpenAI;
    try {
        ({ default: OpenAI } = await import("openai"));
    } catch (err) {
        throw new Error(
            `Provider "${cfg.provider}" cần thư viện \`openai\` nhưng chưa cài được: ${err.message}\n` +
            `  npm install openai`);
    }
    _client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl ?? undefined });
    _client.__key = key;
    return _client;
}

/** Đặt lại client — chỉ dùng trong test. */
export function _reset() { _client = null; }

/**
 * Gemini `contents` → OpenAI `messages`.
 *
 * Nhận CẢ HAI dạng để mặt tiếp xúc của `llm.js` không phải đổi:
 *   - dạng Gemini: `{role, parts: [{text} | {functionCall} | {functionResponse}]}`
 *   - dạng OpenAI: `{role, content}` — truyền thẳng
 *
 * `role: "model"` của Gemini = `role: "assistant"` của OpenAI.
 */
export function toMessages(system, contents) {
    const out = [];
    if (system) out.push({ role: "system", content: system });

    for (const c of contents ?? []) {
        if (!c) continue;
        // Đã là message OpenAI (có `content` là chuỗi, hoặc là message `tool`).
        if (typeof c.content === "string" || c.role === "tool" || Array.isArray(c.tool_calls)) {
            out.push(c);
            continue;
        }
        const parts = c.parts ?? [];
        const role = c.role === "model" ? "assistant" : (c.role ?? "user");

        const toolResults = parts.filter(p => p?.functionResponse);
        if (toolResults.length) {
            // Mỗi kết quả tool là MỘT message riêng, mang `tool_call_id` — không gộp được.
            for (const p of toolResults) {
                out.push({
                    role: "tool",
                    tool_call_id: p.functionResponse.id ?? p.functionResponse.name,
                    content: typeof p.functionResponse.response === "string"
                        ? p.functionResponse.response
                        : JSON.stringify(p.functionResponse.response ?? {}),
                });
            }
            continue;
        }

        const calls = parts.filter(p => p?.functionCall);
        const text = parts.filter(p => typeof p?.text === "string").map(p => p.text).join("");
        if (calls.length) {
            out.push({
                role: "assistant",
                content: text || null,
                tool_calls: calls.map((p, i) => ({
                    id: p.functionCall.id ?? `call_${i}`,
                    type: "function",
                    function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
                })),
            });
            continue;
        }
        out.push({ role, content: text });
    }
    return out;
}

/** functionDeclarations (Gemini) → tools (OpenAI). */
export function toTools(tools) {
    return (tools ?? []).map(t => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description ?? "",
            // Gemini gọi là `parameters`, OpenAI cũng vậy — nhưng nếu thiếu thì một số provider
            // từ chối, nên luôn có một schema rỗng hợp lệ.
            parameters: t.parameters ?? { type: "object", properties: {} },
        },
    }));
}

/**
 * `tool_calls` của OpenAI → `functionCalls` hình dạng Gemini.
 *
 * `arguments` là CHUỖI JSON. Parse hỏng thì trả `{}` kèm `_raw` chứ KHÔNG ném: một model trả
 * JSON lệch là chuyện thường, và làm sập cả lượt chạy vì nó là phản ứng quá tay — vòng gọi tool
 * ở tầng trên đã biết cách báo lại cho model sửa.
 */
export function toFunctionCalls(message) {
    return (message?.tool_calls ?? []).map(tc => {
        let args = {};
        let raw = tc.function?.arguments ?? "";
        try { args = raw ? JSON.parse(raw) : {}; } catch { args = {}; }
        return { id: tc.id, name: tc.function?.name, args, ...(args && Object.keys(args).length === 0 && raw ? { _raw: raw } : {}) };
    });
}

export async function chat({ cfg, system, contents, tools = [], temperature = 0.2, _sdk = null }) {
    const api = _sdk ?? await client(cfg);
    const body = {
        model: cfg.model,
        messages: toMessages(system, contents),
        temperature,
    };
    if (tools.length) {
        body.tools = toTools(tools);
        body.tool_choice = "auto";
    }

    const res = await api.chat.completions.create(body);
    const msg = res?.choices?.[0]?.message ?? {};

    return {
        text: msg.content ?? "",
        functionCalls: toFunctionCalls(msg),
        // Khối NGUYÊN BẢN để echo lại — giữ `tool_calls[].id` (xem chú thích đầu file).
        content: msg,
        usage: res?.usage ?? null,
    };
}

export async function vision({ cfg, system, text, images = [], temperature = 0.2, _sdk = null }) {
    const api = _sdk ?? await client(cfg);
    const content = [
        { type: "text", text },
        ...images.map(i => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.base64}` } })),
    ];
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content });

    const res = await api.chat.completions.create({ model: cfg.visionModel, messages, temperature });
    return { text: res?.choices?.[0]?.message?.content ?? "", usage: res?.usage ?? null };
}

export async function listModels({ cfg, _sdk = null }) {
    const api = _sdk ?? await client(cfg);
    const res = await api.models.list();
    const data = res?.data ?? res ?? [];
    return (Array.isArray(data) ? data : [...data]).map(m => m.id ?? String(m));
}
