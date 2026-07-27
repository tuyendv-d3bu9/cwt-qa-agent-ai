
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("Missing GEMINI_API_KEY in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: key });
const pager = await ai.models.list();

console.log("\nModels can use this key:\n");
for await (const m of pager) {
  const id = (m.name ?? "").replace("models/", "");
  if (id.startsWith("gemini")) console.log("  " + id);
}
console.log(`\nConfigured in .env: GEMINI_MODEL=${process.env.GEMINI_MODEL ?? "(not set)"}\n`);
