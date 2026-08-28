// agents/runtime/llm.js
// MẶT TIẾP XÚC DUY NHẤT với LLM. 6 node + agent-loop.js gọi `callLLM`, 1 nơi gọi `callVisionLLM`.
//
// R3 — bên dưới giờ có HAI adapter, nhưng chữ ký ở đây KHÔNG đổi, nên không agent nào phải sửa:
//
//   adapters/gemini.js         @google/genai   — provider `gemini`
//   adapters/openai-compat.js  thư viện openai — mọi provider còn lại
//
// Vì sao hai chứ không một: `adapters/gemini.js` đầu file (tóm tắt: `thoughtSignature` của
// Gemini 3, mất là mọi vòng tool-loop hỏng ở LƯỢT THỨ HAI).

import dotenv from "dotenv";
dotenv.config();

import { getCache, setCache } from "./cache.js";
import { resolveLlmConfig, cacheIdentity } from "./llm-config.js";
import * as geminiAdapter from "./adapters/gemini.js";
import * as openaiAdapter from "./adapters/openai-compat.js";

const ADAPTERS = { "gemini": geminiAdapter, "openai-compat": openaiAdapter };

let _cfg = null;
/** Cấu hình hiện tại. Đọc env một lần rồi nhớ — env không đổi giữa chừng một lần chạy. */
export function llmConfig() {
    if (!_cfg) _cfg = resolveLlmConfig();
    return _cfg;
}
/** Chỉ dùng trong test. */
export function _resetLlmConfig() { _cfg = null; geminiAdapter._reset(); openaiAdapter._reset(); }

function adapterFor(cfg) {
    const a = ADAPTERS[cfg.adapter];
    if (!a) throw new Error(`Không có adapter "${cfg.adapter}" cho provider "${cfg.provider}".`);
    return a;
}

async function withRetry(fn, maxRetries = 4, initialDelayMs = 2000) {
  let delay = initialDelayMs;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Mã lỗi tạm thời giống nhau ở mọi provider (429 quá hạn mức, 503 quá tải). Chuỗi thì
      // khác nhau, nên bắt cả hai: `status` của SDK và chuỗi trong message.
      const isRetryable =
        err?.status === 503 ||
        err?.status === 429 ||
        err?.status === 500 ||
        err?.message?.includes("503") ||
        err?.message?.includes("429") ||
        err?.message?.includes("high demand") ||
        err?.message?.includes("rate limit") ||
        err?.message?.includes("RESOURCE_EXHAUSTED") ||
        err?.message?.includes("UNAVAILABLE");

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      console.warn(`[LLM] Lỗi tạm thời từ ${llmConfig().provider} (${err.status || err.message}). ` +
        `Thử lại lần ${attempt}/${maxRetries} sau ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

/**
 * @param {string}  system      - content of roles/*.md
 * @param {Array}   contents    - conversation history
 * @param {Array}   tools       - list of functionDeclarations (can be empty)
 * @param {boolean} useCache
 * @returns {{text, functionCalls, content, usage, fromCache}}
 */
export async function callLLM({ system, contents, tools = [], useCache = true, temperature = 0.2 }) {
  const cfg = llmConfig();

  // ⚠ KHOÁ CACHE PHẢI CÓ PROVIDER + BASE URL, không chỉ tên model.
  // `llama-3.3-70b` có trên Groq lẫn Together; khoá chỉ theo tên model thì hai provider **ăn
  // cache của nhau**, và câu trả lời sai đó trông y hệt câu trả lời thật.
  const keyPayload = {
    ...cacheIdentity(cfg),
    model: cfg.model,
    system, contents,
    tools: tools.map(t => t.name),
  };

  const hit = await getCache(keyPayload);
  if (useCache && hit) {
    return { ...hit, fromCache: true };
  }

  const out = {
    ...(await withRetry(() => adapterFor(cfg).chat({ cfg, system, contents, tools, temperature }))),
    fromCache: false,
  };

  if (useCache && out.functionCalls.length === 0) {
    await setCache(keyPayload, out);
  }

  return out;
}

export const modelName = () => llmConfig().model;
export const providerName = () => llmConfig().provider;

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Vision call — send image(s) alongside text.
 *
 * WHY A SEPARATE ENTRY POINT: callLLM's cache key is JSON.stringify(payload), and payload
 * includes `contents`. Putting base64 image bytes in there would hash a huge string on
 * every call and, worse, make the key change with every pixel — a cache that never hits
 * and costs work to miss. Here the key uses the image PATH + a hash of its BYTES instead,
 * so the same image really does hit cache while a changed image really does miss.
 *
 * Cách khoá đó GIỮ NGUYÊN ở R3 — nó đúng, và đổi nó là mất toàn bộ cache ảnh.
 *
 * @param {{system: string, text: string, images: string[], useCache?: boolean, temperature?: number}} opts
 *   images — repo-relative file paths (screenshots produced by the spec run)
 */
export async function callVisionLLM({ system, text, images = [], useCache = true, temperature = 0.2 }) {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const path = await import("node:path");
  const cfg = llmConfig();

  const payload = [];
  const keyImages = [];

  for (const imagePath of images) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    if (!mimeType) {
      throw new Error(`Định dạng ảnh không hỗ trợ: ${imagePath} (chỉ .jpg/.jpeg/.png/.webp)`);
    }
    let bytes;
    try {
      bytes = await readFile(imagePath);
    } catch (err) {
      // A missing screenshot is not a reason to guess: the caller decides what an
      // unreadable image means (it maps to UNCLEAR, never to pass).
      throw new Error(`Không đọc được ảnh ${imagePath}: ${err.message}`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    payload.push({ mimeType, base64: bytes.toString("base64") });
    keyImages.push({ path: imagePath, sha256: digest, bytes: bytes.length });
  }

  const keyPayload = { kind: "vision", ...cacheIdentity(cfg), model: cfg.visionModel, system, text, images: keyImages };
  const hit = await getCache(keyPayload);
  if (useCache && hit) return { ...hit, fromCache: true };

  let res;
  try {
    res = await withRetry(() => adapterFor(cfg).vision({ cfg, system, text, images: payload, temperature }));
  } catch (err) {
    // Provider không có model vision là chuyện cấu hình, nhưng lỗi 400 của nó rơi vào GIỮA vòng
    // verify — cách chỗ cấu hình rất xa. Nói thẳng ra ở đây thay vì để người đọc tự nối.
    if (err?.status === 400 || /vision|image|multimodal|not support/i.test(err?.message ?? "")) {
      throw new Error(
        `Model vision "${cfg.visionModel}" của provider "${cfg.provider}" từ chối ảnh: ${err.message}\n` +
        `  Đặt LLM_MODEL_VISION=<model nhìn được ảnh> trong .env, hoặc đổi provider.\n` +
        `  Xem model đang có: npm run models`);
    }
    throw err;
  }

  const out = { text: res.text ?? "", usage: res.usage ?? null, imagesSent: keyImages.length, fromCache: false };
  if (useCache) await setCache(keyPayload, out);
  return out;
}

/** Danh sách model của provider đang cấu hình — `npm run models`. */
export async function listModels() {
  const cfg = llmConfig();
  return adapterFor(cfg).listModels({ cfg });
}
