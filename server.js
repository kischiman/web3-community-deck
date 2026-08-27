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
import * as auth from "./lib/admin-auth.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");
const PORT = Number(process.env.PORT) || 4400;

// ---------------------------------------------------------------- state

// The deck's shape, so the phone remote can walk panels as well as slides.
const DECK = [
  { title: "Proposal", panels: ["Proposal"] },
  { title: "Web3", panels: ["Web3"] },
  { title: "Practices", panels: ["Practices"] },
  { title: "Process", panels: ["Process V1", "Process V2", "Argentina", "Australia", "Japan"] },
  { title: "Practical examples", panels: ["Practical examples"] },
];

const STEPS = DECK.flatMap((s, slide) => s.panels.map((panel, sub) => ({ slide, sub, panel, title: s.title })));

const state = {
  slide: 0, // 0..4, mirrored between screen and phone
  sub: 0, // panel within the slide
  bottlenecks: [], // { id, text }
  generation: {
    status: "idle", // idle | running | done | error
    source: null, // "claude" | "library"
    rows: [],
    error: null,
    startedAt: null,
    finishedAt: null,
  },
};

let nextId = 1;
const clients = new Set();
const budgetClients = new Set();

function budgetChanged() {
  const payload = `data: ${JSON.stringify({ updatedAt: budget.getState().updatedAt })}\n\n`;
  for (const res of budgetClients) {
    try {
      res.write(payload);
    } catch {
      budgetClients.delete(res);
    }
  }
}

function broadcast() {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

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

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  // --- pages
  if (pathname === "/") return serveStatic(res, "index.html");
  if (pathname === "/m" || pathname === "/mobile") return serveStatic(res, "mobile.html");
  if (pathname === "/budget") return serveStatic(res, "budget.html");
  if (pathname === "/admin") return serveStatic(res, "admin.html");

  // --- budget: shared state, so everyone with the link sees the same numbers.
  // The base rate card is not in this payload unless the admin has opted in.
  if (pathname === "/api/budget") return json(res, 200, budget.publicView());

  if (pathname === "/api/admin/state") {
    if (!auth.authed(req)) return json(res, 401, { error: "not signed in" });
    return json(res, 200, { ...budget.adminView(), storage: budget.storageInfo() });
  }

  if (pathname === "/api/admin/enabled") {
    return json(res, 200, { enabled: auth.enabled() });
  }

  if (pathname === "/api/budget/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ updatedAt: budget.getState().updatedAt })}\n\n`);
    budgetClients.add(res);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => {
      clearInterval(keepAlive);
      budgetClients.delete(res);
    });
    return;
  }

  if (pathname === "/api/budget/export") {
    // the export carries the rate card, so it is admin-only
    if (!auth.authed(req)) return json(res, 401, { error: "not signed in" });
    res.writeHead(200, {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="budget-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return res.end(JSON.stringify(budget.getState(), null, 2));
  }

  // --- live state stream
  if (pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      // nginx-based proxies buffer responses by default, which would stall the
      // stream and make the phone and the screen fall out of step when deployed
      "x-accel-buffering": "no",
    });
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const keepAlive = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
    return;
  }

  if (pathname === "/api/state") return json(res, 200, state);

  if (pathname === "/api/info") {
    return json(res, 200, {
      companionUrl: companionUrl(req),
      provider: providerLabel(),
      steps: STEPS,
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

    if (pathname === "/api/slide") {
      const n = Number(body.slide);
      if (Number.isInteger(n) && n >= 0 && n < DECK.length) {
        const sub = Number(body.sub) || 0;
        state.slide = n;
        state.sub = Math.max(0, Math.min(DECK[n].panels.length - 1, sub));
        broadcast();
      }
      return json(res, 200, { ok: true, slide: state.slide, sub: state.sub });
    }

    if (pathname === "/api/step") {
      const at = STEPS.findIndex((s) => s.slide === state.slide && s.sub === state.sub);
      const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, at + (body.dir < 0 ? -1 : 1)))];
      state.slide = next.slide;
      state.sub = next.sub;
      broadcast();
      return json(res, 200, { ok: true, slide: state.slide, sub: state.sub });
    }

    // --- admin sign-in
    if (pathname === "/api/admin/login") {
      if (!auth.enabled()) return json(res, 503, { error: "admin is not configured on this server" });
      const token = auth.login(body.password);
      if (!token) return json(res, 401, { error: "wrong password" });
      return json(res, 200, { token });
    }

    if (pathname === "/api/admin/logout") {
      auth.logout(auth.tokenFrom(req));
      return json(res, 200, { ok: true });
    }

    // --- admin-only mutations: the rate card, assignment, and the prefill switch
    if (pathname.startsWith("/api/admin/")) {
      if (!auth.authed(req)) return json(res, 401, { error: "not signed in" });
      const action = pathname.slice("/api/admin/".length);
      const ok =
        action === "rate" ? budget.setRate(body.key, body.value)
        : action === "prefill" ? budget.setPrefill(body.id, body.value)
        : action === "prefill-all" ? budget.setPrefillAll(body.value)
        : action === "assign" ? budget.assign(body.id, body.proposalId)
        : action === "update" ? budget.updateTask(body.id, body)
        : action === "task" ? budget.addTask(body)
        : action === "remove" ? budget.removeTask(body.id)
        : action === "import" ? budget.replaceState(body.state)
        : action === "reset" ? (budget.reset(), true)
        : null;

      if (ok === null) return json(res, 404, { error: "unknown admin action" });
      if (!ok) return json(res, 400, { error: "could not apply" });

      budgetChanged();
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

      budgetChanged();
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
      state.bottlenecks.push({ id: nextId++, text });
      broadcast();
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/bottlenecks/update") {
      const item = state.bottlenecks.find((b) => b.id === Number(body.id));
      const text = String(body.text || "").trim().slice(0, 240);
      if (item && text) {
        item.text = text;
        broadcast();
      }
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/bottlenecks/delete") {
      state.bottlenecks = state.bottlenecks.filter((b) => b.id !== Number(body.id));
      broadcast();
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/bottlenecks/reorder") {
      const order = Array.isArray(body.ids) ? body.ids.map(Number) : [];
      const byId = new Map(state.bottlenecks.map((b) => [b.id, b]));
      const reordered = order.map((id) => byId.get(id)).filter(Boolean);
      // anything the client didn't know about stays at the end
      for (const b of state.bottlenecks) if (!order.includes(b.id)) reordered.push(b);
      state.bottlenecks = reordered;
      broadcast();
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/generate") {
      if (state.generation.status === "running") {
        return json(res, 202, { ok: true, note: "already running" });
      }
      if (state.bottlenecks.length === 0) {
        return json(res, 400, { error: "no bottlenecks captured yet" });
      }
      state.generation = {
        status: "running",
        source: null,
        rows: [],
        error: null,
        startedAt: Date.now(),
        finishedAt: null,
      };
      broadcast();

      // fire and forget — the SSE stream carries the result back to both surfaces
      generateSolutions(state.bottlenecks.map((b) => b.text))
        .then(({ rows, source }) => {
          state.generation = {
            status: "done",
            source,
            rows,
            error: null,
            startedAt: state.generation.startedAt,
            finishedAt: Date.now(),
          };
        })
        .catch((err) => {
          state.generation = {
            status: "error",
            source: null,
            rows: [],
            error: err.message,
            startedAt: state.generation.startedAt,
            finishedAt: Date.now(),
          };
        })
        .finally(broadcast);

      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/reset") {
      state.bottlenecks = [];
      state.generation = { status: "idle", source: null, rows: [], error: null, startedAt: null, finishedAt: null };
      broadcast();
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "unknown endpoint" });
  }

  // --- static assets
  return serveStatic(res, pathname.replace(/^\//, ""));
}

// State must be loaded before the first request, or a visitor could be served the
// seed and then overwrite the real thing.
await budget.init();

// Coalesced writes could otherwise be dropped by a shutdown mid-deploy.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    await budget.flush().catch(() => {});
    process.exit(0);
  });
}

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
