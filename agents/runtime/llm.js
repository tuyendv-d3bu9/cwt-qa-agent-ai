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
