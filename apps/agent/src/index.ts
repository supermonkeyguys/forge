/**
 * Forge Agent Service entry point.
 *
 * Exposes an HTTP server that:
 * - POST /run    — start a new generation job
 * - GET  /status/:jobId — get job status
 * - POST /resume/:jobId — inject user input into a WAITING job
 *
 * In production this will consume jobs from BullMQ (Redis).
 * For Phase 0 / local dev, direct HTTP calls are fine.
 */

import { createServer } from "node:http";

const PORT = process.env.PORT ?? "3001";

const server = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/health") {
    res.end(JSON.stringify({ status: "ok", service: "forge-agent" }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(`forge agent service listening on :${PORT}`);
});
