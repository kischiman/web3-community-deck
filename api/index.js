// The serverless entry point.
//
// Vercel serves everything in public/ straight from its CDN, so the deck, the budget
// sheet and the admin panel arrive without waking anything — which was the whole point
// of moving. Only the calls those pages make land here.
//
// The handler is the same one the local server uses; nothing about the routes is
// duplicated. What differs is the shape of the host: no process to keep state in, so
// server.js re-reads the document on every API request and waits for every write.

import { handle } from "../server.js";

export default async function (req, res) {
  try {
    await handle(req, res);
  } catch (err) {
    console.error(`[500] ${req.method} ${req.url}:`, err.stack || err.message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err.message || "server error" }));
    } else {
      res.end();
    }
  }
}

// Generation calls a model and waits for the answer, which the default ten seconds
// will not always cover.
export const config = { maxDuration: 60 };
