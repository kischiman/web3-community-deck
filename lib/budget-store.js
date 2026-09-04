// Shared state for the budget model.
//
// Two audiences. The public dashboard lets collaborators propose themselves for lines —
// quantity, unit, rate. The admin panel is the only place the base rate card exists, and
// the only place proposals get accepted onto the project.
//
// State is in memory and mirrored to JSON so a restart doesn't lose the day's work.
// Free hosting has an ephemeral disk, so Export is the real backup.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as persist from "./budget-persist.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.BUDGET_FILE || path.join(HERE, "..", "budget-state.json");

export const PHASES = [
  { id: "p1", title: "Phase 1 · Baseline", note: "Establish a credible pre-evaluation baseline in each neighbourhood." },
  {
    id: "p2",
    title: "Phase 2 · Design, intervention, implementation",
    note: "Education and a design sprint, then research prototypes, then keeping them in use.",
  },
  { id: "p3", title: "Phase 3 · Assessment", note: "Closing survey, analysis, written outputs." },
];

export const DEFAULT_RATES = {
  principal: 1100,
  researcher: 650,
  designer: 700,
  engineer: 800,
  pm: 600,
  apartment: 2600,
  perdiem: 70,
  contingency: 18,
};

export const UNITS = ["days", "weeks", "months", "sessions", "fixed"];

const DAYS_PER_MONTH = 21;

function seed() {
  // `role` survives only to seed a starting rate; from then on the line owns its
  // own figure and roles play no part in what anything costs.
  const t = (phase, name, note, qty, role, unit, kind) => ({
    id: `${phase}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`,
    phase, name, note, qty, unit,
    rate: role === "fixed" ? null : DEFAULT_RATES[role] ?? 0,
    kind: kind || "fee",
    proposals: [],
    assigned: null,
    prefill: false,
  });

  // A line that comes straight from the research process: named and described, but
  // deliberately unpriced until someone proposes a quantity and a rate for it.
  const s = (phase, name, note, role) => ({ ...t(phase, name, note, 0, role, "days"), fromProcess: true });

  return [
    t("p1", "Resident researcher", "Three months in place — ethnography, infrastructure baseline, community organising", 3 * DAYS_PER_MONTH, "researcher", "days"),
    t("p1", "Apartment", "For the duration, not a hotel", 3, "apartment", "months", "expense"),
    t("p1", "Per diem", "Living costs while resident", 3 * DAYS_PER_MONTH, "perdiem", "days", "expense"),
    t("p1", "Research lead oversight", "Fieldwork design, weekly supervision, quality of the record", 12, "principal", "days"),
    t("p1", "Baseline survey fieldwork", "300 completions across two neighbourhoods, incl. enumerators", 18, "researcher", "days"),
    t("p1", "Translation", "Instrument and consent forms — Mandarin, Malay, Tamil", 4500, "fixed", "fixed", "expense"),
    t("p1", "Participant incentives · wave 1", "300 respondents", 7000, "fixed", "fixed", "expense"),
    t("p1", "Synthesis and Phase 2 scoping", "Fieldwork report, primitive mapping, and the Phase 2 scope and price", 10, "principal", "days"),
    t("p1", "Project management", "Across the phase", 32, "pm", "days"),

    t("p2", "Kickoff design and preparation", "Week-one curriculum, week-two sprint structure, materials", 12, "designer", "days"),
    t("p2", "Week 1 · education workshops", "Facilitation, two people in the room", 10, "designer", "days"),
    t("p2", "Week 2 · design sprint", "Facilitation plus an engineer for feasibility in the room", 10, "designer", "days"),
    t("p2", "Principal, both weeks", "Leading the room", 10, "principal", "days"),
    t("p2", "Venue, catering and materials", "Two weeks — the space where people get to know each other", 9000, "fixed", "fixed", "expense"),
    t("p2", "Participant incentives · workshops", "Attendance across two weeks", 5500, "fixed", "fixed", "expense"),

    t("p2", "Web 2.0 prototype", "One person assembling a working prototype as they go, from tools that already exist. Not custom development", 12, "engineer", "days"),
    t("p2", "Web 3.0 prototype", "The harder of the two — custom, but research-grade rather than production", 30, "engineer", "days"),
    t("p2", "Design across both", "Interface, onboarding flows, plain-language content", 20, "designer", "days"),
    t("p2", "Data pipeline", "IRB-compliant: consent, withdrawal that deletes, scheduled destruction. Adapted from Kaeru-chan. Does not scale down with user numbers", 18, "engineer", "days"),
    t("p2", "Technical direction", "Architecture, review, the handoff plan per tool", 8, "principal", "days"),

    t("p2", "Deployment and onboarding", "Getting people to first use, in person", 12, "researcher", "days"),
    t("p2", "Retention and support", "Six months — check-ins, fixes, noticing when a group goes quiet", 24, "researcher", "days"),
    t("p2", "Interim in-app surveys", "Instrument, deployment, and reading what comes back", 8, "researcher", "days"),
    t("p2", "Maintenance engineering", "Six months of breakages — research-scale, tens of users per site", 9, "engineer", "days"),
    t("p2", "Project management", "Across the phase", 67, "pm", "days"),

    t("p3", "Closing survey fieldwork", "Same respondents, plus the residents who built the tools", 18, "researcher", "days"),
    t("p3", "Participant incentives · wave 2", "300 respondents", 7000, "fixed", "fixed", "expense"),
    t("p3", "Telemetry and comparative analysis", "Against each neighbourhood's own baseline, then across", 20, "principal", "days"),
    t("p3", "Community engagement manual", "The deliverable the proposal promises to ministries", 12, "designer", "days"),
    t("p3", "Policy briefs and publication support", "One or two briefs, plus support to the journal paper", 12, "principal", "days"),
    t("p3", "Findings sessions", "Participants first, then citizens and policymakers", 6, "principal", "days"),

    // ---------------------------------------------------------------- process steps
    // The research process shown on deck slide 2 — each step is a line here, so the
    // two surfaces describe the same work. These carry no admin estimate yet: quantity
    // is 0 and `prefill` is false, so the public page shows them exactly like every
    // other open line and the figure comes from whoever proposes themselves.
    s("p1", "Specify the sampling and measurement plan", "Who counts as a resident; the social resilience questionnaire", "principal"),
    s("p1", "Screen and identify neighbourhoods", "What influences resilience or participation; differences that cannot be eliminated", "researcher"),
    s("p1", "Select neighbourhoods and secure collaboration", "Agreements with the two communities", "principal"),
    s("p1", "Baseline data collection", "Survey, then interviews, focus groups, observation and available data", "researcher"),
    s("p1", "Map existing conditions and baseline profiles", "Existing projects; vulnerabilities and excluded groups; resilience indicators, opportunities and risks", "researcher"),
    s("p1", "Review readiness", "Share an accessible baseline; confirm recruitment, consent, data governance and monitoring", "principal"),

    s("p2", "Present the findings from Phase 1", "Invite residents to validate and prioritise them; recruit the core groups", "researcher"),
    s("p2", "Project identification", "Workshops to prioritise and select projects; neighbourhood walks and meetings", "designer"),
    s("p2", "Co-design the intervention", "Educational sessions and training, then a design sprint for each group", "designer"),

    s("p2", "Monitor and maintain engagement", "The data collection pipeline; sustaining usage momentum across both groups", "researcher"),
    s("p2", "Complete the projects and prepare Phase 3", "Encourage completion; compile the records and gather feedback", "researcher"),

    s("p3", "Re-use the Phase 1 survey", "Conducted with the original participants where possible", "researcher"),
    s("p3", "Gather qualitative explanations", "Why the numbers moved the way they did", "researcher"),
    s("p3", "Compile the records from Phase 2", "Everything the projects and the tooling produced", "researcher"),
    s("p3", "Analyse change and compare neighbourhoods", "Phase 1 and Phase 3 surveys against each other", "principal"),
    s("p3", "Validate the findings with the communities", "Back to the participants before anyone else", "principal"),
    s("p3", "Report and maintenance", "Outcomes, limitations and recommendations; a handover plan for the community projects", "principal"),
  ];
}

const fresh = () => ({
  rates: { ...DEFAULT_RATES },
  settings: {},
  // Who is carrying each phase, keyed by phase id. PHASES itself is a constant, so
  // this cannot live on it.
  owners: {},
  // Seed lines someone has deleted, so the backfill leaves them deleted.
  removed: [],
  // Slide 4's capture. It used to live in the server's memory, which a serverless host
  // does not have between one request and the next.
  workshop: { bottlenecks: [], nextId: 1, generation: null },
  tasks: seed(),
  updatedAt: Date.now(),
});

let state = fresh();
let origin = "seed";

/** Called once at startup, before the server accepts requests. */
export async function init() {
  const { state: loaded, source } = await persist.loadInitial(FILE);
  origin = source;
  // Merge first — the backfill inside migrate() decides what is already on the board
  // by phase and name, and would not recognise a line still tagged with an old bucket.
  state = foldIntoProcess(loaded ? migrate(mergePhaseTwo(loaded)) : fresh());
  if (!loaded) origin = "seed";
  console.log(`[budget] state from ${origin} · storage: ${persist.describe()}`);
  return origin;
}

export const storageInfo = () => ({
  origin,
  durable: persist.usingGist(),
  where: persist.describe(),
});

/** Push any coalesced write out — called on shutdown so a deploy can't drop it. */
export const flush = () => persist.flush();

/** Write the document out and wait for it — the serverless path. */
export const commit = () => persist.saveNow(state, FILE);

/** Re-read before serving. Two functions can run at once on different machines, so a
 *  copy held in memory from a previous request is a guess, not the board. */
export async function reload() {
  const { state: loaded } = await persist.loadInitial(FILE);
  if (loaded) state = foldIntoProcess(migrate(mergePhaseTwo(loaded)));
  return state;
}

export const getWorkshop = () => {
  state.workshop = state.workshop || { bottlenecks: [], nextId: 1, generation: null };
  return state.workshop;
};

/**
 * The deck's process slide is the public view of this budget, so the board carries the
 * same lines. Every fee line that is not one of those steps is folded into a single
 * priced "Delivery" line for its phase: the phase total is unchanged, and any proposals
 * sitting on the folded lines move across rather than disappearing with them. Expenses
 * are left where they are — they were never process steps and are not meant to be.
 *
 * Runs once, and records that it has. Without the flag, a task added later from /budget
 * — neither a process step nor an expense — would be folded away on the next boot.
 */
/** "Phase 2 · Build" → "Delivery · Build". The deck shows all three of Phase 2's
 *  buckets in one section, where three rows called "Delivery" are indistinguishable. */
function deliveryName(phase) {
  const title = PHASES.find((p) => p.id === phase)?.title || "";
  const tail = title.split("·").pop().trim();
  return tail ? `Delivery · ${tail}` : "Delivery";
}

/** Phase 2 was three buckets; it is one. Retagging is enough — order is preserved,
 *  and nothing else in a task depends on which bucket it used to sit in. */
function mergePhaseTwo(raw) {
  if (!raw || !Array.isArray(raw.tasks)) return raw;
  for (const t of raw.tasks) {
    if (t.phase === "p2a" || t.phase === "p2b" || t.phase === "p2c") t.phase = "p2";
  }
  return raw;
}

function foldIntoProcess(raw) {
  raw.settings = raw.settings || {};
  if (raw.settings.foldedToProcess) {
    // Folded before the lines were named per phase. Only the untouched default is
    // rewritten, so an admin's own name for a line is never overwritten — which also
    // makes this safe to run on every boot.
    for (const t of raw.tasks) {
      if (t.id.endsWith("-delivery") && t.name === "Delivery") t.name = deliveryName(t.phase);
    }
    return raw;
  }

  const keep = [];
  const byPhase = new Map();
  for (const t of raw.tasks) {
    if (t.fromProcess || t.kind === "expense") {
      keep.push(t);
      continue;
    }
    if (!byPhase.has(t.phase)) byPhase.set(t.phase, []);
    byPhase.get(t.phase).push(t);
  }

  for (const [phase, folded] of byPhase) {
    // A fixed line's quantity is its amount, which is the only shape that can hold a
    // sum of lines that were quoted in different units at different rates.
    const amount = folded.reduce((a, t) => a + baseAmount(t), 0);
    keep.push({
      id: `${phase}-delivery`,
      phase,
      name: deliveryName(phase),
      note: `Folded from ${folded.length} line${folded.length === 1 ? "" : "s"}: ${folded
        .map((t) => t.name)
        .join("; ")}`.slice(0, 300),
      qty: amount,
      unit: "fixed",
      rate: null,
      kind: "fee",
      proposals: folded.flatMap((t) => t.proposals || []),
      // Several folded lines could each have had someone on them; only one can be on
      // the line that replaces them, so the rest go back to being proposals.
      assigned: folded.map((t) => t.assigned).find(Boolean) || null,
      prefill: false,
      fromProcess: false,
      // A fixed amount that is nonetheless a fee — see updateTask.
      folded: true,
    });
  }

  raw.tasks = keep;
  raw.settings.foldedToProcess = true;
  return raw;
}

function migrate(raw) {
  try {
    if (Array.isArray(raw.tasks) && raw.rates) {
      raw.settings = raw.settings || {};
      raw.owners = raw.owners || {};
      raw.removed = raw.removed || [];
      raw.workshop = raw.workshop || { bottlenecks: [], nextId: 1, generation: null };
      // the prefill switch used to be global; carry it onto each task
      const wasGlobal = raw.settings.prefillRates === true;
      delete raw.settings.prefillRates;
      for (const t of raw.tasks) {
        if (typeof t.prefill !== "boolean") t.prefill = wasGlobal;
      }
      // lines used to derive their cost from a role; give each one its own rate
      for (const t of raw.tasks) {
        if (typeof t.rate !== "number" && t.rate !== null) {
          t.rate = t.role === "fixed" ? null : raw.rates?.[t.role] ?? 0;
        }
        if (t.role === "fixed") t.unit = "fixed";
        delete t.role;
      }

      // migrate the earlier single-claim shape
      for (const t of raw.tasks) {
        if (!Array.isArray(t.proposals)) {
          t.proposals = t.claim
            ? [{ id: "m" + Math.random().toString(36).slice(2, 8), name: t.claim.name, qty: t.qty, unit: t.unit, rate: t.rateOverride || null, notes: t.claim.notes, at: t.claim.at }]
            : [];
          t.assigned = null;
          delete t.claim;
          delete t.rateOverride;
        }
      }

      // Lines added to the seed after this state was written — the research-process
      // steps, for instance. Append only: a stored line is never overwritten or
      // removed, so quantities, rates and proposals already in flight are untouched.
      const known = new Set(raw.tasks.map((t) => t.id));
      // Merging Phase 2's three buckets changed the ids the seed generates, so identity
      // by id alone would see every one of those lines as new and add it a second time.
      // A line already on the board under its old id is the same line.
      const byName = new Set(raw.tasks.map((t) => `${t.phase}|${t.name}`));
      // Lines someone deleted stay deleted. Both keys are held because merging Phase 2
      // changed the ids the seed generates, so an older removal is recorded by name.
      const removed = new Set(raw.removed || []);
      for (const t of seed()) {
        if (known.has(t.id) || byName.has(`${t.phase}|${t.name}`)) continue;
        if (removed.has(t.id) || removed.has(`${t.phase}|${t.name}`)) continue;
        // Once folded, the seed's own fee lines are exactly what was folded away —
        // re-adding them here would undo the fold on every boot.
        if (raw.settings?.foldedToProcess && !t.fromProcess && t.kind !== "expense") continue;
        raw.tasks.push(t);
      }

      return raw;
    }
  } catch (err) {
    console.error("[budget] could not migrate stored state:", err.message);
  }
  return fresh();
}

function save() {
  state.updatedAt = Date.now();
  persist.save(state, FILE);
}

// ---------------------------------------------------------------- reads

export const getState = () => state;

const proposalOf = (t) => t.proposals.find((p) => p.id === t.assigned) || null;

/** The admin's own estimate for a line: a fixed sum, or quantity x rate. */
export function baseAmount(task) {
  if (task.kind === "divider") return 0;
  if (task.unit === "fixed") return Number(task.qty) || 0;
  return (Number(task.qty) || 0) * (Number(task.rate) || 0);
}

/** What the line costs once someone is on it; falls back to the base estimate. */
export function effectiveAmount(task) {
  if (task.kind === "divider") return 0;
  const p = proposalOf(task);
  if (!p) return baseAmount(task);
  // Someone on the line who named no rate does not make it free — the estimate on the
  // line still stands until they do.
  return proposalAmount(p) || baseAmount(task);
}

/** What a proposal comes to. Zero when whoever wrote it named no rate: a quantity is
 *  not a sum of money, and reading "2 months" as "$2" is worse than saying nothing. */
export function proposalAmount(p) {
  // A fixed proposal carries its sum in rate; older ones kept it in qty.
  if (p.unit === "fixed") return Number(p.rate || p.qty) || 0;
  if (!p.rate) return 0;
  return (Number(p.qty) || 0) * (Number(p.rate) || 0);
}

export function totals(useEffective = true) {
  const { rates, tasks } = state;
  const amount = useEffective ? effectiveAmount : baseAmount;
  const byPhase = Object.fromEntries(PHASES.map((p) => [p.id, 0]));
  for (const t of tasks) byPhase[t.phase] += amount(t);
  const net = Object.values(byPhase).reduce((a, b) => a + b, 0);
  const contingency = net * ((Number(rates.contingency) || 0) / 100);
  return { byPhase, net, contingency, total: net + contingency };
}

/** A proposal as the public board is allowed to see it.
 *
 * With the budget hidden, every field that could carry a figure is dropped here
 * rather than concealed in the page — the payload itself must not contain what a
 * viewer is not meant to read. A fixed proposal keeps its sum in `rate`, and older
 * ones kept it in `qty`, so for those neither number travels.
 */
function publicProposal(p, money) {
  if (money) return { ...p, amount: proposalAmount(p) };
  const { rate, qty, ...rest } = p;
  return p.unit === "fixed" ? rest : { ...rest, qty };
}

/** What the public dashboard is allowed to see. */
export function publicView() {
  const money = state.settings.publicMoney === true;
  // Absent means visible: a board that predates this switch should not go quiet.
  const showProposals = state.settings.publicProposals !== false;

  const withOwners = PHASES.map((p) => ({ ...p, owner: (state.owners || {})[p.id] || "" }));

  return {
    phases: withOwners,
    units: UNITS,
    // Whether the board shows cost at all, or scope alone. Off unless the admin
    // has turned it on, so a link shared in a hurry cannot leak the budget.
    money,
    showProposals,
    // The rate card never crosses this line as a whole. A base rate travels only
    // for the individual lines marked prefill, and only as that line's suggestion.
    // The contingency percentage is a project markup, not anyone's day rate, but it
    // is still a figure, so it travels only when money does.
    contingency: money ? Number(state.rates.contingency) || 0 : null,
    rates: null,
    tasks: state.tasks.map((t) => {
      // A fixed line's quantity *is* its price, so it is not scope and cannot
      // travel as scope.
      const priced = t.unit === "fixed";
      return {
        id: t.id,
        phase: t.phase,
        name: t.name,
        note: t.note,
        unit: t.unit,
        kind: t.kind,
        added: t.added,
        // What the line costs. Once the board is showing cost, every line shows its
        // own — anything else leaves the public totals disagreeing with the admin's
        // over exactly the lines nobody thought to mark.
        qty: money ? t.qty : null,
        rate: money && !priced ? t.rate || null : null,
        // What the propose form fills in for you. That is what `prefill` is for, and
        // it stays a per-line choice.
        suggestedQty: t.prefill && (money || !priced) ? t.qty : null,
        suggestedRate: money && t.prefill && !priced ? t.rate || null : null,
        prefilled: !!t.prefill,
        // A divider's span is time, not money, so it travels whatever the board is
        // showing — hiding it would leave a marker with nothing to mark.
        span: t.kind === "divider" ? { qty: t.qty, unit: t.unit } : null,
        // the deck's process slide shows exactly these lines
        fromProcess: !!t.fromProcess,
        proposals: showProposals ? t.proposals.map((p) => publicProposal(p, money)) : [],
        // Whether anyone is on the line is part of who proposed, so it goes too.
        assigned: showProposals ? t.assigned : null,
        // Said plainly, so a page can explain an empty line rather than imply nobody came.
        proposalCount: t.proposals.length,
      };
    }),
    updatedAt: state.updatedAt,
  };
}

export function adminView() {
  return {
    phases: PHASES.map((p) => ({ ...p, owner: (state.owners || {})[p.id] || "" })),
    units: UNITS,
    rates: state.rates,
    settings: state.settings,
    tasks: state.tasks.map((t) => ({
      ...t,
      base: baseAmount(t),
      effective: effectiveAmount(t),
      proposals: t.proposals.map((p) => ({ ...p, amount: proposalAmount(p) })),
    })),
    totals: { effective: totals(true), base: totals(false) },
    people: people(),
    updatedAt: state.updatedAt,
  };
}

/** Everyone who has proposed, with what they're on and what it comes to. */
export function people() {
  const map = new Map();
  for (const t of state.tasks) {
    for (const p of t.proposals) {
      const key = p.name.toLowerCase();
      if (!map.has(key)) map.set(key, { name: p.name, proposed: 0, assigned: 0, lines: [] });
      const rec = map.get(key);
      const amt = proposalAmount(p);
      const isAssigned = t.assigned === p.id;
      rec.proposed += amt;
      if (isAssigned) rec.assigned += amt;
      rec.lines.push({ taskId: t.id, task: t.name, phase: t.phase, amount: amt, assigned: isAssigned });
    }
  }
  return [...map.values()].sort((a, b) => b.assigned - a.assigned || b.proposed - a.proposed);
}

// ---------------------------------------------------------------- writes

export function setRate(key, value) {
  if (!(key in state.rates)) return false;
  state.rates[key] = Number(value) || 0;
  save();
  return true;
}

/** Whether this line's base rate is offered as a suggestion on the public board. */
/** Whether the public board shows who has proposed themselves. On unless turned off;
 *  the lines keep taking proposals either way. */
export function setPublicProposals(value) {
  state.settings = state.settings || {};
  state.settings.publicProposals = Boolean(value);
  save();
  return true;
}

/** Name whoever is carrying a phase. Clearing it is just an empty name. */
export function setPhaseOwner(phase, name) {
  if (!PHASES.some((p) => p.id === phase)) return false;
  state.owners = state.owners || {};
  const clean = String(name || "").trim().slice(0, 60);
  if (clean) state.owners[phase] = clean;
  else delete state.owners[phase];
  save();
  return true;
}

/** Fee or expense. Expenses are money going out rather than work someone can take on,
 *  so they stay on the budget sheet and off the process page. */
export function setExpense(id, value) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  // A divider is neither, and switching it to either would put it back in the counts.
  if (task.kind === "divider") return false;
  task.kind = value ? "expense" : "fee";
  save();
  return true;
}

export function setPrefill(id, value) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  task.prefill = Boolean(value);
  save();
  return true;
}

/** Same decision across every line at once — 31 checkboxes is not a workflow. */
export function setPrefillAll(value) {
  for (const t of state.tasks) t.prefill = Boolean(value);
  save();
  return true;
}

/** Whether the public board shows cost at all. Off means scope only. */
export function setPublicMoney(value) {
  state.settings.publicMoney = Boolean(value);
  save();
  return true;
}

/** Add or replace this person's proposal on a line. One proposal per name per line. */
export function propose(id, { name, qty, unit, rate, notes }) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;

  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return false;

  const existing = task.proposals.findIndex((p) => p.name.toLowerCase() === clean.toLowerCase());
  const prior = existing >= 0 ? task.proposals[existing] : null;

  // While the budget is hidden the board never sent this person their own figures,
  // so their form posts them back empty. That means "unchanged", not "clear it" —
  // without this, editing your days on a scope-only board silently wipes the rate
  // you had already entered. When the budget is public the field was populated, so
  // an empty one is a deliberate erasure and is honoured.
  const concealed = state.settings.publicMoney !== true && prior;
  const blank = (v) => v === undefined || v === null || v === "";
  const priced = (UNITS.includes(unit) ? unit : task.unit) === "fixed";

  const proposal = {
    id: "p" + crypto.randomBytes(4).toString("hex"),
    name: clean,
    qty: concealed && priced && blank(qty) ? prior.qty : Number(qty) || 0,
    unit: UNITS.includes(unit) ? unit : task.unit || "days",
    rate: concealed && blank(rate) ? prior.rate : Number(rate) || null,
    notes: String(notes || "").trim().slice(0, 600),
    at: Date.now(),
  };

  if (existing >= 0) {
    proposal.id = prior.id; // keep the id so an assignment survives an edit
    task.proposals[existing] = proposal;
  } else {
    task.proposals.push(proposal);
  }

  save();
  return true;
}

/** Admin edits someone's proposal in place — the id survives, so an assignment holds. */
export function updateProposal(id, proposalId, { name, qty, unit, rate, notes }) {
  const task = state.tasks.find((t) => t.id === id);
  const p = task?.proposals.find((x) => x.id === proposalId);
  if (!p) return false;

  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 60);
    if (!clean) return false;
    p.name = clean;
  }
  if (unit !== undefined && UNITS.includes(unit)) p.unit = unit;
  if (qty !== undefined && qty !== "") p.qty = Number(qty) || 0;
  if (rate !== undefined) p.rate = Number(rate) || null;
  if (notes !== undefined) p.notes = String(notes).trim().slice(0, 600);
  if (p.unit === "fixed") p.rate = null;

  save();
  return true;
}

export function withdraw(id, proposalId) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  const before = task.proposals.length;
  task.proposals = task.proposals.filter((p) => p.id !== proposalId);
  if (task.assigned === proposalId) task.assigned = null;
  if (task.proposals.length === before) return false;
  save();
  return true;
}

/** Admin: put someone on the line, or take them off. */
export function assign(id, proposalId) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;
  if (proposalId && !task.proposals.some((p) => p.id === proposalId)) return false;
  task.assigned = proposalId || null;
  save();
  return true;
}

/** Admin edits the line itself: what it is, how much of it, and at what rate. */
/**
 * Put a phase's lines in the given order. Only that phase moves: its lines are lifted
 * out, reordered, and dropped back into the slots they occupied, so every other phase
 * keeps its own arrangement whatever the client happened to know about.
 *
 * Ids the client did not send — a line added by someone else a moment ago — keep their
 * relative order at the end of the phase rather than vanishing from it.
 */
export function reorderTasks(phase, ids) {
  if (!PHASES.some((p) => p.id === phase)) return false;
  if (!Array.isArray(ids)) return false;

  const slots = [];
  const mine = [];
  state.tasks.forEach((t, i) => {
    if (t.phase === phase) {
      slots.push(i);
      mine.push(t);
    }
  });
  if (!slots.length) return false;

  const byId = new Map(mine.map((t) => [t.id, t]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  const seen = new Set(ordered.map((t) => t.id));
  for (const t of mine) if (!seen.has(t.id)) ordered.push(t);

  slots.forEach((slot, i) => {
    state.tasks[slot] = ordered[i];
  });
  save();
  return true;
}

export function updateTask(id, { name, note, qty, unit, rate, memo }) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return false;

  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 90);
    if (!clean) return false;
    task.name = clean;
  }
  if (note !== undefined) task.note = String(note).trim().slice(0, 300);
  // Never reaches publicView, which names the fields it exposes rather than
  // excluding the ones it does not — a note added here cannot leak by omission.
  if (memo !== undefined) task.memo = String(memo).trim().slice(0, 500);
  if (unit !== undefined && UNITS.includes(unit)) task.unit = unit;
  if (qty !== undefined && qty !== "") task.qty = Number(qty) || 0;
  if (rate !== undefined) task.rate = Number(rate) || 0;

  // A fixed line's amount lives in qty; leaving a rate behind would quietly
  // reappear if the unit were ever switched back.
  if (task.unit === "fixed") task.rate = null;
  // Fee or expense is a decision, not a consequence of the unit — a flat sum can be
  // either, and only whoever is keeping the budget knows which. The switcher on the
  // line owns it; editing the line must not quietly overrule what they chose.

  save();
  return true;
}

export function addTask({ phase, name, note, qty, unit, rate, fromProcess, memo, kind }) {
  if (!PHASES.some((p) => p.id === phase)) return false;
  const clean = String(name || "").trim().slice(0, 90);
  if (!clean) return false;

  state.tasks.push({
    id: `${phase}-${Date.now().toString(36)}`,
    phase,
    name: clean,
    note: String(note || "").trim().slice(0, 300),
    memo: String(memo || "").trim().slice(0, 500),
    qty: Number(qty) || 0,
    unit: UNITS.includes(unit) ? unit : "days",
    rate: unit === "fixed" ? null : Number(rate) || 0,
    // A divider is a marker in the list, not work: it carries a span, never a price.
    kind: kind === "divider" ? "divider" : unit === "fixed" ? "expense" : "fee",
    proposals: [],
    assigned: null,
    prefill: false,
    added: true,
    // Added from the deck's process slide, so it belongs in that list as well as
    // on the board — without this the line would vanish the moment it was created.
    fromProcess: !!fromProcess,
  });
  save();
  return true;
}

export function removeTask(id) {
  const before = state.tasks.length;
  const gone = state.tasks.find((t) => t.id === id);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  if (state.tasks.length === before) return false;
  // Remember it. The seed backfill re-adds anything the seed has and the board does
  // not, so without this a deleted seed line comes back — at seed defaults, losing
  // whatever quantity, rate and prefill it had — the next time the server starts.
  state.removed = state.removed || [];
  const mark = `${gone.phase}|${gone.name}`;
  if (!state.removed.includes(id)) state.removed.push(id);
  if (!state.removed.includes(mark)) state.removed.push(mark);
  save();
  return true;
}

export function reset() {
  state = fresh();
  save();
}

export function replaceState(next) {
  if (!next || !Array.isArray(next.tasks) || !next.rates) return false;
  state = {
    rates: { ...DEFAULT_RATES, ...next.rates },
    settings: { ...(next.settings || {}) },
    tasks: next.tasks,
    updatedAt: Date.now(),
  };
  save();
  return true;
}
