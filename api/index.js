// The serverless entry point.
//
// Vercel serves everything in public/ straight from its CDN, so the deck, the budget
// sheet and the admin panel arrive without waking anything — which was the whole point
// of moving. Only the calls those pages make land here.
//
// The handler is the same one the local server uses; nothing about the routes is
// duplicated. What differs is the shape of the host: no process to keep state in, so
// server.js re-reads the document on every API request and waits for every write.
//
// The import is deliberately inside the handler. At module scope a failure gives an
// opaque FUNCTION_INVOCATION_FAILED with the reason only in the platform's own logs;
// here it comes back in the response, where whoever is debugging can read it.

let handlePromise = null;
const loadHandler = () => (handlePromise ||= import("../server.js").then((m) => m.handle));

export default async function (req, res) {
  let handle;
  try {
    handle = await loadHandler();
  } catch (err) {
    handlePromise = null; // a bad import should not be cached forever
    console.error("[boot] could not load the handler:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    return res.end(
      JSON.stringify({
        error: "handler failed to load",
        detail: err && err.message,
        stack: (err && err.stack ? String(err.stack) : "").split("\n").slice(0, 6),
      })
    );
  }

  try {
    await handle(req, res);
  } catch (err) {
    console.error(`[500] ${req.method} ${req.url}:`, err.stack || err.message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err.message || "server error", where: "handler" }));
    } else {
      res.end();
    }
  }
}

// Generation calls a model and waits for the answer, which the default ten seconds
// will not always cover.
export const config = { maxDuration: 60 };
