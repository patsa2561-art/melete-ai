#!/usr/bin/env node
// 🔌 Melete MCP server (stdio transport) — drops into Claude Desktop / Cursor / any MCP client.
// Config example:  { "mcpServers": { "melete": { "command": "melete-mcp" } } }
// Newline-delimited JSON-RPC 2.0 on stdin/stdout; every result is an Ed25519-signed, offline-verifiable artifact.
import { handleMcpRequest } from "../dist/mcp.js";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const s = line.trim(); if (!s) return;
  let req; try { req = JSON.parse(s); } catch { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) + "\n"); return; }
  const res = handleMcpRequest(req);
  // notifications (no id) get no response per JSON-RPC; everything else replies
  if (req && req.id !== undefined && req.id !== null) process.stdout.write(JSON.stringify(res) + "\n");
});
process.stderr.write("melete-mcp ready (stdio) — every result is a signed, offline-verifiable certificate\n");
