// agents/list-models.js — `npm run models`
//
// R3: chạy được với MỌI provider, không riêng Gemini. Đi qua `llm.js`/adapter, không tự dựng
// client — nếu tự dựng thì đây thành chỗ thứ hai biết cách nói chuyện với provider, và hai chỗ
// đó sẽ lệch nhau đúng vào lúc ai đó thêm provider mới.

import "dotenv/config";
import { listModels, llmConfig } from "./runtime/llm.js";

let cfg;
try {
    cfg = llmConfig();
} catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
}

console.log(`\nProvider : ${cfg.provider}`);
console.log(`Endpoint : ${cfg.baseUrl ?? "(mặc định của SDK)"}`);
console.log(`Model    : ${cfg.model}`);
console.log(`Vision   : ${cfg.visionModel}${cfg.visionModel === cfg.model ? "  (dùng lại LLM_MODEL)" : ""}\n`);

let ids;
try {
    ids = await listModels();
} catch (err) {
    // Nhiều endpoint tự dựng (ollama cũ, một số gateway) không có `/v1/models`. Đó không phải
    // lý do để coi cấu hình là sai — nói rõ và dừng ở đúng mức đó.
    console.error(`Không liệt kê được model từ ${cfg.provider}: ${err.message}`);
    console.error(`  Một số endpoint không hỗ trợ /v1/models. Cấu hình vẫn có thể đúng —` +
        ` thử chạy pipeline để biết chắc.\n`);
    process.exit(1);
}

console.log(`Model dùng được với khoá này (${ids.length}):\n`);
for (const id of ids) console.log("  " + String(id).replace(/^models\//, ""));

const known = ids.map(i => String(i).replace(/^models\//, ""));
if (cfg.model && !known.includes(cfg.model)) {
    console.log(`\n⚠ LLM_MODEL="${cfg.model}" KHÔNG có trong danh sách trên. Kiểm tra lại .env.`);
}
console.log("");
