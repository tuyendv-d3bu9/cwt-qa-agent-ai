// agents/runtime/llm-config.js
// R3 — MỘT chỗ quyết định "đang nói chuyện với provider nào, model nào, bằng khoá nào".
//
// Thuần đọc env, không tạo client, không gọi mạng → test được mà không cần khoá thật.

/**
 * Endpoint mặc định của từng provider. Để trống `LLM_BASE_URL` thì lấy ở đây.
 *
 * `gemini` KHÔNG có baseUrl vì nó đi SDK gốc (`@google/genai`), không đi đường OpenAI-compat —
 * lý do ở `adapters/gemini.js`.
 */
export const PROVIDER_DEFAULTS = Object.freeze({
    gemini: { adapter: "gemini", baseUrl: null, keyEnv: "GEMINI_API_KEY" },
    openai: { adapter: "openai-compat", baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
    groq: { adapter: "openai-compat", baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
    openrouter: { adapter: "openai-compat", baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
    deepseek: { adapter: "openai-compat", baseUrl: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY" },
    together: { adapter: "openai-compat", baseUrl: "https://api.together.xyz/v1", keyEnv: "TOGETHER_API_KEY" },
    // Chạy máy mình: không cần khoá, nhưng `openai` SDK vẫn đòi một chuỗi khác rỗng.
    ollama: { adapter: "openai-compat", baseUrl: "http://localhost:11434/v1", keyEnv: null, defaultKey: "ollama" },
    lmstudio: { adapter: "openai-compat", baseUrl: "http://localhost:1234/v1", keyEnv: null, defaultKey: "lmstudio" },
});

/** Provider mặc định. Giữ `gemini` để `.env` đang chạy không chết vì một bản nâng cấp. */
export const DEFAULT_PROVIDER = "gemini";

export class LlmConfigError extends Error {
    constructor(message) { super(message); this.name = "LlmConfigError"; }
}

/**
 * Đọc cấu hình LLM từ env.
 *
 * @param {object} [env]  mặc định `process.env` — tiêm vào để test
 * @param {(msg: string) => void} [warn]
 * @returns {{provider, adapter, baseUrl, apiKey, model, visionModel, legacy: string[]}}
 */
export function resolveLlmConfig(env = process.env, warn = console.warn) {
    const legacy = [];

    const provider = String(env.LLM_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
    const spec = PROVIDER_DEFAULTS[provider];
    if (!spec) {
        throw new LlmConfigError(
            `LLM_PROVIDER="${provider}" không nhận ra. Đang hỗ trợ: ${Object.keys(PROVIDER_DEFAULTS).join(", ")}.\n` +
            `  Provider khác nói được giao thức OpenAI: đặt LLM_PROVIDER=openai và LLM_BASE_URL=<endpoint>.`);
    }

    // ── MODEL ──
    // `GEMINI_MODEL` cũ vẫn đọc được, nhưng nói rõ nó đã đổi tên. Im lặng chấp nhận biến cũ là
    // cách để hai tên cùng tồn tại mãi mãi và không ai biết cái nào thắng.
    let model = String(env.LLM_MODEL || "").trim();
    if (!model && env.GEMINI_MODEL) {
        model = String(env.GEMINI_MODEL).trim();
        legacy.push(`GEMINI_MODEL → LLM_MODEL`);
    }
    if (!model) model = provider === "gemini" ? "gemini-2.5-flash" : "";
    if (!model) {
        throw new LlmConfigError(
            `Thiếu LLM_MODEL cho provider "${provider}". Xem model đang có: npm run models`);
    }

    // ── KHOÁ ──
    let apiKey = String(env.LLM_API_KEY || "").trim();
    if (!apiKey && spec.keyEnv && env[spec.keyEnv]) {
        apiKey = String(env[spec.keyEnv]).trim();
        legacy.push(`${spec.keyEnv} → LLM_API_KEY`);
    }
    if (!apiKey && spec.defaultKey) apiKey = spec.defaultKey;
    if (!apiKey) {
        throw new LlmConfigError(
            `Thiếu khoá API cho provider "${provider}".\n` +
            `  1. Copy .env.example thành .env\n` +
            `  2. Đặt LLM_API_KEY=<khoá>${spec.keyEnv ? ` (hoặc ${spec.keyEnv})` : ""}\n` +
            (provider === "gemini" ? `  3. Lấy khoá tại https://aistudio.google.com/apikey\n` : ""));
    }

    const baseUrl = String(env.LLM_BASE_URL || "").trim() || spec.baseUrl;
    // Model vision: để trống thì DÙNG LẠI `model`. Không tự đoán tên model vision của provider —
    // đoán sai thì lỗi 400 rơi vào giữa vòng verify, cách chỗ cấu hình rất xa.
    const visionModel = String(env.LLM_MODEL_VISION || "").trim() || model;

    if (legacy.length && warn) {
        warn(`[LLM] Đang dùng biến môi trường CŨ: ${legacy.join(", ")}. ` +
            `Vẫn chạy, nhưng nên đổi sang tên mới trong .env (xem .env.example).`);
    }

    return { provider, adapter: spec.adapter, baseUrl, apiKey, model, visionModel, legacy };
}

/**
 * Phần cấu hình đi vào KHOÁ CACHE.
 *
 * ⚠ PHẢI có `provider` và `baseUrl`, không chỉ `model`. Hai provider dùng chung một tên model
 * (`llama-3.3-70b` có trên Groq lẫn Together) sẽ **ăn cache của nhau** nếu khoá chỉ có tên model
 * — và câu trả lời sai đó trông y hệt câu trả lời thật, chỉ do một model khác sinh ra.
 *
 * KHÔNG bao giờ đưa `apiKey` vào khoá: khoá cache được ghi ra đĩa dưới dạng JSON.
 */
export function cacheIdentity(cfg) {
    return { provider: cfg.provider, baseUrl: cfg.baseUrl ?? null };
}
