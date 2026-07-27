import "dotenv/config";
import { callLLM, modelName } from "./runtime/llm.js";

console.log(`Call model: ${modelName()} ...`);

const res = await callLLM({
  system: "You are a QA Automation Engineer of course Pracitical AI for Manual Testers at CO-WELL Tech Academy. Answer briefly in Vietnamese.",
  contents: [
    { role: "user", parts: [{ text: "Bạn tên là gì? Hãy nói cho tôi biết tên khoá học của bạn?" }] },
  ],
});

console.log("\n--- RESULT ---");
console.log(res.text);
console.log(res.fromCache ? "\n(from cache)" : `\n(token used: ${res.usage?.totalTokenCount ?? "?"})`);
