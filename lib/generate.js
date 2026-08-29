// Slide 4 generation.
//
// Live path: one model call with web search enabled, so the examples are real and current.
// Fallback path: the curated library in ./library.js — used when there's no API key or the
// call fails. A presentation should never show an error where a table should be.

import { complete, provider } from "./llm.js";
import { libraryRows } from "./library.js";

const SYSTEM = `You are a researcher preparing live material during a client workshop on Web3, community building and social resilience. The audience is a Singapore-based organisation, not a crypto audience.

For each bottleneck the room named, give exactly two answers:

1. web3 — a solution that only works, or works markedly better, because of Web3 primitives (verifiable shared state, user-held assets, programmable money, credible neutrality, permissionless composition). Say plainly what the primitive buys them. Do not include anything a normal database would do just as well.
2. web2 — a solution that already works without any of that, ideally with a track record. Be honest: if the Web2 answer is the better first move, say so in the "how" field.

Use web search to ground every example in something real and current. Prefer named projects, programmes or institutions with a live URL. No hypotheticals, no vapourware, no examples you are not confident exist.

Be concise and specific. "solution" is one sentence. "how" is one or two sentences of mechanism or caveat. Two examples per cell.

Respond with JSON only — no preamble, no markdown fences, no commentary after. Shape:

{"rows":[{"bottleneck":"<restate the bottleneck in <=12 words>","theme":"<2-4 word theme>","web3":{"solution":"...","how":"...","examples":[{"name":"...","note":"...","url":"https://..."}]},"web2":{"solution":"...","how":"...","examples":[{"name":"...","note":"...","url":"https://..."}]}}]}`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in response");
  return JSON.parse(candidate.slice(start, end + 1));
}

// Without search, the model can only cite what it already knows — so ask for
// well-known projects only, and the UI says the links are unverified.
const NO_SEARCH_NOTE = `
You do not have web access for this request. Only name projects, programmes or institutions you are highly confident exist and are still active, and give their canonical homepage URL. If you are not confident about an example, give a different one rather than guessing.`;

async function callModel(bottlenecks, webSearch) {
  const text = await complete({
    system: webSearch ? SYSTEM : SYSTEM + NO_SEARCH_NOTE,
    prompt:
      "Bottlenecks named by the room, in priority order:\n\n" +
      bottlenecks.map((b, i) => `${i + 1}. ${b}`).join("\n") +
      "\n\nReturn one row per bottleneck, in the same order.",
    webSearch,
    maxTokens: 16000,
  });

  const parsed = extractJson(text);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  if (rows.length === 0) throw new Error("model returned no rows");
  return rows;
}

// 503 "high demand" is usually momentary — worth several tries before downgrading,
// since the alternative is a worse table in front of a client.
const isTransient = (err) => /\b(503|overloaded|high demand)\b/i.test(err.message);

// A quota error is a property of the key, not of the moment. Once search grounding
// reports one, stop paying five seconds a time to rediscover it this session.
const isQuota = (err) => /\b(429|quota|RESOURCE_EXHAUSTED)\b/i.test(err.message);
let groundingBlocked = false;

async function withRetry(fn, attempts = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
}

export async function generateSolutions(bottlenecks) {
  if (!provider()) {
    return { rows: libraryRows(bottlenecks), source: "library" };
  }

  // Grounded in live search is best. Search grounding has its own quota, though,
  // so fall through to an ungrounded call before giving up on the model entirely.
  if (!groundingBlocked) {
    try {
      return { rows: await callModel(bottlenecks, true), source: "live" };
    } catch (err) {
      if (isQuota(err)) {
        groundingBlocked = true;
        console.error("[generate] search grounding is out of quota on this key — skipping it from now on");
      } else {
        console.error("[generate] grounded call failed:", err.message.slice(0, 120));
      }
    }
  }

  try {
    return { rows: await withRetry(() => callModel(bottlenecks, false)), source: "live-unverified" };
  } catch (err) {
    console.error("[generate] ungrounded call failed, using library:", err.message.slice(0, 120));
    return { rows: libraryRows(bottlenecks), source: "library" };
  }
}
