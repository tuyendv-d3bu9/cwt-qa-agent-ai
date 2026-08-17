// agents/runtime/llm.js

import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";
import { getCache, setCache } from "./cache.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

let _ai = null;
function client() {
  if (_ai) return _ai;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is missing.\n" +
      "  1. Copy .env.example to .env\n" +
      "  2. Get key from https://aistudio.google.com/apikey\n" +
      "  3. Paste key into .env"
    );
  }
  _ai = new GoogleGenAI({ apiKey });
  return _ai;
}

/**
 * @param {string}  system      - content of roles/*.md
 * @param {Array}   contents    - conversation history
 * @param {Array}   tools       - list of functionDeclarations (can be empty)
 * @param {boolean} useCache
 */
export async function callLLM({ system, contents, tools = [], useCache = true, temperature = 0.2 }) {
  const config = {
    systemInstruction: system,
    temperature,
  };

  if (tools.length > 0) {
    config.tools = [{ functionDeclarations: tools }];
    config.automaticFunctionCalling = { disable: true };
  }

  const keyPayload = { model: MODEL, system, contents, tools: tools.map(t => t.name) };

  const hit = await getCache(keyPayload);
  if (useCache && hit) {
    return { ...hit, fromCache: true };
  }

  const res = await client().models.generateContent({
    model: MODEL,
    contents,
    config,
  });

  const out = {
    text: res.text ?? "",
    functionCalls: res.functionCalls ?? [],
    usage: res.usageMetadata ?? null,
    fromCache: false,
  };

  if (useCache && out.functionCalls.length === 0) {
    await setCache(keyPayload, out);
  }

  return out;
}

export const modelName = () => MODEL;

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
 * @param {{system: string, text: string, images: string[], useCache?: boolean, temperature?: number}} opts
 *   images — repo-relative file paths (screenshots produced by the spec run)
 */
export async function callVisionLLM({ system, text, images = [], useCache = true, temperature = 0.2 }) {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const path = await import("node:path");

  const parts = [{ text }];
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
    parts.push({ inlineData: { mimeType, data: bytes.toString("base64") } });
    keyImages.push({ path: imagePath, sha256: digest, bytes: bytes.length });
  }

  const keyPayload = { kind: "vision", model: MODEL, system, text, images: keyImages };
  const hit = await getCache(keyPayload);
  if (useCache && hit) return { ...hit, fromCache: true };

  const res = await client().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: { systemInstruction: system, temperature },
  });

  const out = {
    text: res.text ?? "",
    usage: res.usageMetadata ?? null,
    imagesSent: keyImages.length,
    fromCache: false,
  };
  if (useCache) await setCache(keyPayload, out);
  return out;
}
