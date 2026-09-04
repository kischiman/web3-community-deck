// Local presentation server.
// Serves the big-screen deck (/) and the phone companion (/m), and keeps the two
// in sync over Server-Sent Events. No database, no build step — state lives in memory
// for the duration of the talk.

import "./lib/env.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { generateSolutions } from "./lib/generate.js";
import { answerFromDeck } from "./lib/ask.js";
import { providerLabel } from "./lib/llm.js";
import * as budget from "./lib/budget-store.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");
const PORT = Number(process.env.PORT) || 4400;

// ---------------------------------------------------------------- state

// Shared content, not a shared screen: everyone browses on their own and sees the
// same material as each other's changes land. It lives in the persisted document
// rather than in this process, because on a serverless host there is no process to
// come back to.
const IDLE = { status: "idle", source: null, rows: [], error: null, startedAt: null, finishedAt: null };

const workshop = () => budget.getWorkshop();
const deckState = () => ({
  bottlenecks: workshop().bottlenecks,
  generation: workshop().generation || IDLE,
});

/** Everything mutating goes through here: write the document out and wait for it. */
const persistAll = () => budget.commit();

// ---------------------------------------------------------------- helpers

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error("body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function serveStatic(res, relPath) {
  const filePath = path.join(PUBLIC, relPath);
  if (!filePath.startsWith(PUBLIC)) return json(res, 403, { error: "forbidden" });
  fs.readFile(filePath, (err, data) => {
    if (err) return json(res, 404, { error: "not found" });
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

function lanAddress() {
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal) return iface.address;
  }
  return "localhost";
}

// The address to put on the big screen for the phone to open.
// Deployed, that is whatever host the browser used; locally it is the LAN IP,
// since a phone cannot reach "localhost".
function companionUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = req.headers["x-forwarded-proto"] || "http";
  const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i.test(host);
  if (host && !local) return `${proto}://${host}/m`;
  return `http://${lanAddress()}:${PORT}/m`;
}

// ---------------------------------------------------------------- routes

const server = http.createServer((req, res) => {
  // An exception anywhere below would otherwise leave the request hanging with no
  // response at all — which in a browser looks like nothing happening, with nothing
  // in the console to go on. Always answer, even if only to say what broke.
  handle(req, res).catch((err) => {
    console.error(`[500] ${req.method} ${req.url}:`, err.stack || err.message);
    if (!res.headersSent) json(res, 500, { error: err.message || "server error" });
    else res.end();
  });
});

export async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // Another machine may have served the last request. Re-read before answering, so
  // nobody is shown a copy from a previous invocation — and so a write is applied to
  // the board as it stands rather than as this instance last remembered it.
  if (pathname.startsWith("/api/") && pathname !== "/api/info") {
    await budget.reload();
  }

  // --- pages
  if (pathname === "/") return serveStatic(res, "index.html");
  if (pathname === "/m" || pathname === "/mobile") return serveStatic(res, "mobile.html");
  if (pathname === "/budget") return serveStatic(res, "budget.html");
  if (pathname === "/admin") return serveStatic(res, "admin.html");

  // --- budget: shared state, so everyone with the link sees the same numbers.
  // The base rate card is not in this payload unless the admin has opted in.
  if (pathname === "/api/budget") return json(res, 200, budget.publicView());

  if (pathname === "/api/admin/state") {
    return json(res, 200, { ...budget.adminView(), storage: budget.storageInfo() });
  }


  if (pathname === "/api/budget/export") {
    res.writeHead(200, {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="budget-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify(budget.getState(), null, 2));
  }

  // --- live state stream

  if (pathname === "/api/state") return json(res, 200, deckState());

  if (pathname === "/api/info") {
    return json(res, 200, {
      companionUrl: companionUrl(req),
      provider: providerLabel(),
    });
  }

  // --- mutations
  if (req.method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    // --- admin sign-in

    // --- admin-only mutations: the rate card, assignment, and the prefill switch
    if (pathname.startsWith("/api/admin/")) {
      const action = pathname.slice("/api/admin/".length);
      const ok =
        action === "rate" ? budget.setRate(body.key, body.value)
        : action === "phase-owner" ? budget.setPhaseOwner(body.phase, body.name)
        : action === "expense" ? budget.setExpense(body.id, body.value)
        : action === "prefill" ? budget.setPrefill(body.id, body.value)
        : action === "prefill-all" ? budget.setPrefillAll(body.value)
        : action === "public-money" ? budget.setPublicMoney(body.value)
        : action === "assign" ? budget.assign(body.id, body.proposalId)
        : action === "update" ? budget.updateTask(body.id, body)
        : action === "proposal-update" ? budget.updateProposal(body.id, body.proposalId, body)
        : action === "proposal-remove" ? budget.withdraw(body.id, body.proposalId)
        : action === "task" ? budget.addTask(body)
        : action === "remove" ? budget.removeTask(body.id)
        : action === "reorder" ? budget.reorderTasks(body.phase, body.ids)
        : action === "import" ? budget.replaceState(body.state)
        : action === "reset" ? (budget.reset(), true)
        : null;

      if (ok === null) return json(res, 404, { error: "unknown admin action" });
      if (!ok) return json(res, 400, { error: "could not apply" });

      await persistAll();
      return json(res, 200, { ok: true, totals: budget.totals() });
    }

    // --- public: anyone with the link can propose themselves and add tasks
    if (pathname.startsWith("/api/budget/")) {
      const action = pathname.slice("/api/budget/".length);
      const ok =
        action === "propose" ? budget.propose(body.id, body)
        : action === "withdraw" ? budget.withdraw(body.id, body.proposalId)
        : action === "task" ? budget.addTask(body)
        : null;

      if (ok === null) return json(res, 404, { error: "unknown budget action" });
      if (!ok) return json(res, 400, { error: "could not apply" });

      await persistAll();
      return json(res, 200, { ok: true });
    }

    // Ask-this-document. Retrieval happens in the page; this only reads the passages.
    // Deliberately not part of `state` — one person's question is not the room's.
    if (pathname === "/api/ask") {
      const q = String(body.q || "").trim().slice(0, 300);
      const passages = Array.isArray(body.passages) ? body.passages.slice(0, 8) : [];
      if (!q || passages.length === 0) return json(res, 400, { error: "nothing to answer from" });
      try {
        return json(res, 200, { answer: await answerFromDeck(q, passages) });
      } catch (err) {
        console.error("[ask] falling back to passages:", err.message);
        return json(res, 200, { answer: null });
      }
    }

    if (pathname === "/api/bottlenecks") {
      const text = String(body.text || "").trim().slice(0, 240);
      if (!text) return json(res, 400, { error: "empty" });
      const w = workshop();
      w.bottlenecks.push({ id: w.nextId++, text });
      await persistAll();
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/bottlenecks/update") {
      const item = workshop().bottlenecks.find((b) => b.id === Number(body.id));
      const text = String(body.text || "").trim().slice(0, 240);
      if (item && text) {
        item.text = text;
        await persistAll();
      }
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/bottlenecks/delete") {
      const w = workshop();
      w.bottlenecks = w.bottlenecks.filter((b) => b.id !== Number(body.id));
      await persistAll();
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/bottlenecks/reorder") {
      const order = Array.isArray(body.ids) ? body.ids.map(Number) : [];
      const w = workshop();
      const byId = new Map(w.bottlenecks.map((b) => [b.id, b]));
      const reordered = order.map((id) => byId.get(id)).filter(Boolean);
      // anything the client didn't know about stays at the end
      for (const b of w.bottlenecks) if (!order.includes(b.id)) reordered.push(b);
      w.bottlenecks = reordered;
      await persistAll();
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/generate") {
      const w = workshop();
      if (w.bottlenecks.length === 0) {
        return json(res, 400, { error: "no bottlenecks captured yet" });
      }
      // Awaited rather than fired off: a serverless function is frozen the moment it
      // answers, so a promise settling afterwards would never be seen by anyone.
      const startedAt = Date.now();
      try {
        const { rows, source } = await generateSolutions(w.bottlenecks.map((b) => b.text));
        w.generation = { status: "done", source, rows, error: null, startedAt, finishedAt: Date.now() };
      } catch (err) {
        w.generation = { status: "error", source: null, rows: [], error: err.message, startedAt, finishedAt: Date.now() };
      }
      await persistAll();
      return json(res, 200, { ok: true, generation: w.generation });
    }

    if (pathname === "/api/reset") {
      const w = workshop();
      w.bottlenecks = [];
      w.nextId = 1;
      w.generation = null;
      await persistAll();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "unknown endpoint" });
  }

  // --- static assets
  return serveStatic(res, pathname.replace(/^\//, ""));
}

// A serverless host imports the handler and never reaches the boot below.
const standalone = !process.env.VERCEL;

// State must be loaded before the first request, or a visitor could be served the
// seed and then overwrite the real thing.
if (standalone) await budget.init();

// Coalesced writes could otherwise be dropped by a shutdown mid-deploy.
if (standalone) for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    await budget.flush().catch(() => {});
    process.exit(0);
  });
}

if (standalone) {
  server.listen(PORT, "0.0.0.0", () => {
    const lan = lanAddress();
    console.log("");
    console.log("  Web3 · community & social resilience");
    console.log("  ─────────────────────────────────────────────");
    console.log(`  Big screen   http://localhost:${PORT}`);
    console.log(`  Phone        http://${lan}:${PORT}/m`);
    console.log("");
    const label = providerLabel();
    console.log(
      label
        ? `  Live features: ${label}  ·  offline fallbacks if a call fails`
        : "  Live features: off — no API key in .env, using offline fallbacks"
    );
    const store = budget.storageInfo();
    console.log(
      `  Budget storage: ${store.where}` + (store.durable ? "" : "  ⚠ edits are lost on redeploy")
    );
    console.log("");
  });
}
