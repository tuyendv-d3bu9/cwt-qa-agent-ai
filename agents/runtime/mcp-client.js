// agents/runtime/mcp-client.js

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as P from "./paths.js";

/**
 * Tool MCP mà pipeline KHÔNG chạy đúng nếu thiếu.
 *
 * `browser_generate_locator` là cái quan trọng nhất và cũng là cái đã hỏng: **toàn bộ thiết kế
 * P4 dựa vào nó** — Playwright viết locator, LLM không viết locator. Thiếu nó thì không có
 * Page Object, không có thư viện step, không có catalogue, và qa-automation tụt xuống đường
 * dự phòng "LLM viết cả file spec" — đúng đường đã sinh ra 13/21 spec vô dụng.
 */
export const REQUIRED_TOOLS = [
    "browser_snapshot",
    "browser_navigate",
    "browser_click",
    "browser_type",
    "browser_find",
    "browser_generate_locator",
];

export async function connectPlaywrightMCP({ headless = true } = {}) {

  const args = ["@playwright/mcp"];
  if (headless) args.push("--headless");

  // ── `--caps=testing` — LỖI GỐC CỦA LẦN CHẠY 2026-08-23 ──────────────────
  //
  // `browser_generate_locator` KHÔNG nằm trong bộ tool mặc định của @playwright/mcp: nó nằm
  // sau cờ opt-in `--caps=testing` (README của package, mục "Test assertions"). Bản trước của
  // file này không truyền `--caps`, nên mọi lời gọi trả về:
  //
  //     ### Error
  //     Tool "browser_generate_locator" not found
  //
  // và chuỗi đó được lưu vào ô `locator` của registry. Hậu quả đo được trên lần chạy thật:
  // 0 file trong `tests/pages/`, 0 file `.feature`, 21/21 spec đi đường dự phòng, 9 spec chứa
  // selector `ref=`. Tất cả từ một cờ thiếu.
  //
  // Cùng cờ này bật luôn `browser_verify_*` mà các skill có nhắc tới.
  args.push("--caps=testing");

  // Without this, @playwright/mcp writes its page-*.yml dumps to its default location —
  // a `.playwright-mcp/` folder at the CWD, i.e. the repo root. One earlier run left 57
  // of them there. Sending them into .qa-run/ puts them with everything else a run
  // produces, so one delete cleans up and one .gitignore line covers it.
  args.push("--output-dir", P.MCP_OUT_DIR);

  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    args,
  });

  const client = new Client({ name: "qa-agent", version: "1.0.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const available = new Set(tools.map(t => t.name));
  console.log(`  MCP connected. Has ${tools.length} tools.`);

  // ── Nổ NGAY LÚC KẾT NỐI nếu thiếu tool ────────────────────────────────
  //
  // Bản trước chỉ IN danh sách tool ra rồi đi tiếp. Danh sách đó có in ra thật, trong lần chạy
  // 2026-08-23, và không ai đọc — vì lúc đó chưa có gì nói rằng thiếu một tên trong đó là
  // nghiêm trọng. Hệ thống chạy tiếp 21 test case rồi mới lộ ra hậu quả, ở một chỗ chẳng liên
  // quan gì tới nguyên nhân.
  //
  // Thà không chạy còn hơn chạy rồi âm thầm tụt xuống đường dự phòng.
  const missing = REQUIRED_TOOLS.filter(t => !available.has(t));
  if (missing.length) {
    throw new Error(
      `MCP server thiếu ${missing.length} tool bắt buộc: ${missing.join(", ")}\n` +
      `  Tool có sẵn (${tools.length}): ${[...available].sort().join(", ")}\n` +
      `  \`browser_generate_locator\` nằm sau cờ opt-in --caps=testing. Kiểm dòng args.push("--caps=testing")\n` +
      `  trong agents/runtime/mcp-client.js, và phiên bản @playwright/mcp trong package.json.\n` +
      `  KHÔNG chạy tiếp: thiếu tool này thì locator do LLM đoán, đúng cái P4 đã gỡ bỏ.`
    );
  }

  return client;
}
