// agents/runtime/adapters/gemini.js
// R3 — adapter cho `@google/genai` (SDK gốc của Google).
//
// VÌ SAO GEMINI KHÔNG ĐI ĐƯỜNG OpenAI-COMPAT như mọi provider khác.
//
// Google CÓ endpoint OpenAI-compatible, nên gộp về một adapter duy nhất là cám dỗ có thật.
// Nhưng Gemini 3 gắn `thoughtSignature` vào phần `functionCall`, và **từ chối 400 ở lượt sau**
// nếu thiếu nó:
//
//   400 INVALID_ARGUMENT "Function call is missing a thought_signature in functionCall parts.
//   This is required for tools to work correctly"
//
// Đường compat chưa chắc giữ được chữ ký đó. Mất nó thì **mọi vòng tool-loop hỏng ở lượt thứ 2**
// — không phải lượt đầu, nên một lần thử nhanh vẫn xanh. Đây là ngoại lệ CÓ LÝ DO của luật "một
// đường code cho một việc", không phải quên dọn.

let _client = null;

async function client(cfg) {
    if (_client && _client.__key === cfg.apiKey) return _client;
    const { GoogleGenAI } = await import("@google/genai");
    _client = new GoogleGenAI({ apiKey: cfg.apiKey });
    _client.__key = cfg.apiKey;
    return _client;
}

/** Đặt lại client — chỉ dùng trong test. */
export function _reset() { _client = null; }

/**
 * @param {object} o
 * @param {object} o.cfg        từ resolveLlmConfig()
 * @param {string} o.system
 * @param {Array}  o.contents   lịch sử hội thoại dạng Gemini
 * @param {Array}  o.tools      functionDeclarations
 * @param {number} o.temperature
 * @returns {Promise<{text, functionCalls, content, usage}>}
 */
export async function chat({ cfg, system, contents, tools = [], temperature = 0.2, _sdk = null }) {
    const config = { systemInstruction: system, temperature };
    if (tools.length > 0) {
        config.tools = [{ functionDeclarations: tools }];
        config.automaticFunctionCalling = { disable: true };
    }

    const ai = _sdk ?? await client(cfg);
    const res = await ai.models.generateContent({ model: cfg.model, contents, config });

    return {
        text: res.text ?? "",
        functionCalls: res.functionCalls ?? [],
        // Lượt của model ĐÚNG NGUYÊN VĂN như API trả về, đủ mọi part. Vòng tool phải echo lại
        // chính khối này, KHÔNG dựng lại từ `functionCalls` — dựng lại là mất `thoughtSignature`
        // (xem chú thích đầu file).
        content: res.candidates?.[0]?.content ?? null,
        usage: res.usageMetadata ?? null,
    };
}

/**
 * @param {Array<{mimeType: string, base64: string}>} images
 */
export async function vision({ cfg, system, text, images = [], temperature = 0.2, _sdk = null }) {
    const parts = [{ text }, ...images.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.base64 } }))];
    const ai = _sdk ?? await client(cfg);
    const res = await ai.models.generateContent({
        model: cfg.visionModel,
        contents: [{ role: "user", parts }],
        config: { systemInstruction: system, temperature },
    });
    return { text: res.text ?? "", usage: res.usageMetadata ?? null };
}

/** Danh sách model — `npm run models`. */
export async function listModels({ cfg, _sdk = null }) {
    const ai = _sdk ?? await client(cfg);
    const out = [];
    for await (const m of await ai.models.list()) out.push(m.name ?? m.id ?? String(m));
    return out;
}
