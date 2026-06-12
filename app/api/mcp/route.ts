import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/mcp/tools";
import { authenticateMcp, mcpUnauthorized } from "@/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const session = await authenticateMcp(req);
  if (!session) return mcpUnauthorized();

  // Stateless: a fresh server + transport per request (the SDK requires this in
  // stateless mode to avoid cross-request message-id collisions).
  const server = buildMcpServer(session);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Stateless ⇒ no server→client SSE stream and no sessions to terminate.
export async function GET(): Promise<Response> {
  return new Response("Method Not Allowed", { status: 405 });
}
export const DELETE = GET;
