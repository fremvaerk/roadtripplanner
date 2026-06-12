// Stdio MCP server exposing the road-trip app's operations as tools.
//
// CRITICAL: this is a stdio server. The protocol owns stdout — NEVER write to
// stdout except through the transport. All diagnostics go to stderr via
// console.error. There must be no console.log anywhere in this process.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveOwnerSession } from "./owner";
import { buildMcpServer } from "./tools";

async function main() {
  const session = await resolveOwnerSession();
  const server = buildMcpServer(session);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`roadtrip MCP (stdio) ready (owner: ${session.email})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
