// agents/runtime/mcp-client.js

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as P from "./paths.js";

export async function connectPlaywrightMCP({ headless = true } = {}) {

  const args = ["@playwright/mcp"];
  if (headless) args.push("--headless");
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
  console.log(`  MCP connected. Has ${tools.length} tools:`);
  console.log("  " + tools.map(t => t.name).join(", "));

  return client;
}
