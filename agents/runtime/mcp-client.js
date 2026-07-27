
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export async function connectPlaywrightMCP({ headless = true } = {}) {
  const args = ["-y", "@playwright/mcp@latest"];
  if (headless) args.push("--headless");

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
